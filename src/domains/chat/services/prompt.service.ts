import { z } from 'zod';
import type { PromptConfig } from '@shared/types';
import { LowContentSchema } from '@files/validators/file-input.validator';
import { UserInputSchema } from '@auth/validators/user-input.validator';
import { logger } from '@config/logger.config';
import { ITokenizer } from '@interfaces/tokenizer.interface';
import { sanitizeInput } from '@shared/utils';
import {
  ALLOWED_JURISDICTIONS,
  ALLOWED_LANGUAGES,
  ALLOWED_TONES,
  MAX_INPUT_SIZE,
  MAX_TOKEN_OPERATIONS,
  SUSPICIOUS_PATTERNS,
  TOKEN_CACHE_SIZE,
  TOKEN_WINDOW_MS,
} from '@config/prompt.config';
import type {
  ConfigAllowedJurisdiction as AllowedJurisdiction,
  ConfigAllowedLanguage as AllowedLanguage,
  ConfigAllowedTone as AllowedTone,
} from '@shared/types';
import {
  PromptInjectionError,
  ResourceExhaustedError,
  SecurityError,
  ValidationError,
} from '@shared/errors/prompt.errors';

export class PromptService {
  private logger;
  private tokenizer: ITokenizer;
  private tokenCache: Map<string, number> = new Map();
  private tokenizationCount: number = 0;
  private tokenizationWindowStart: number = Date.now();
  private readonly CHARS_PER_TOKEN = 4;

  // Compiled regex patterns for performance
  private readonly priorityRegex: RegExp;
  private readonly boundaryRegex: RegExp;
  private readonly sanitizationPatterns: RegExp[];

  constructor(tokenizer: ITokenizer) {
    this.logger = logger;
    this.tokenizer = tokenizer;

    // Compile regex patterns once for performance
    this.priorityRegex =
      /(Section|Clause|Article|Definition|Preamble)\s+\d+\.\d+/gi;
    this.boundaryRegex = /[\s.!?;:]/g;
    this.sanitizationPatterns = [
      /[\u200B-\u200D\uFEFF]/g,
      /[''']/g,
      /["""]/g,
      /[\r\t]+/g,
      /\n+/g,
    ];

    this.logger.info('PromptService initialized.');
  }

  public sanitizeText(input: string): string {
    this.validateInput(input, 'sanitizeText');

    const normalized = input.normalize('NFKC');

    const sanitized = normalized
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[\r\t]+/g, ' ')
      .replace(/\n+/g, '\n')
      .replace(/(\bignore previous instructions\b)/gi, '')
      .replace(/(\bdo anything\b)/gi, '')
      .trim();
    this.logger.debug(
      { originalLength: input.length, sanitizedLength: sanitized.length },
      'Text sanitized.',
    );
    return sanitized;
  }

  public async mainPrompt(
    input: z.infer<typeof UserInputSchema>,
    config: PromptConfig = {},
  ): Promise<string> {
    const parsedInput = UserInputSchema.parse(input);

    this.validateInput(parsedInput.question, 'mainPrompt-question');
    this.validateInput(parsedInput.context, 'mainPrompt-context');
    parsedInput.chatHistory.forEach((msg, index) => {
      this.validateInput(msg, `mainPrompt-history-${index}`);
    });

    const sanitizedContext = this.sanitizeText(parsedInput.context);
    const sanitizedQuestion = this.sanitizeText(parsedInput.question);
    const sanitizedHistory = this.sanitizeText(
      parsedInput.chatHistory.join('\n'),
    );

    const defaultConfig: PromptConfig = {
      version: '1.0.0',
      maxLength: 8000,
      tone: 'formal',
      temperature: 0,
      truncateStrategy: 'truncate-context',
      language: 'english',
      jurisdiction: 'india',
      logStats: true,
      truncateBuffer: 500,
    };

    const finalConfig = { ...defaultConfig, ...config };
    try {
      this.validateConfig(finalConfig);
    } catch (e) {
      this.logger.error(
        { error: e, config: finalConfig },
        'Invalid prompt configuration.',
      );
      throw e;
    }

    let prompt = `${this.buildPromptHeader(finalConfig)}

${this.formatHistorySection(sanitizedHistory)}

${this.formatContextSection(sanitizedContext)}

=== USER QUESTION ===
${sanitizedQuestion}

=== ANSWER ===
`.trim();

    prompt = await this.applyTruncation(
      prompt,
      finalConfig,
      sanitizedHistory,
      sanitizedContext,
    );

    const finalTokens = await this.countTokensCached(prompt);
    if (finalTokens > finalConfig.maxLength!) {
      this.logger.error(
        { finalTokens, maxLength: finalConfig.maxLength },
        'Prompt still exceeds maxLength after truncation.',
      );
      throw new Error('Prompt still exceeds maxLength after truncation');
    }

    if (finalConfig.logStats) {
      this.logger.info(
        {
          version: finalConfig.version,
          length: prompt.length,
          tokens: finalTokens,
          tone: finalConfig.tone,
          language: finalConfig.language,
          jurisdiction: finalConfig.jurisdiction,
          questionLength: sanitizedQuestion.length,
        },
        'Main Prompt Generated',
      );
    }

    return prompt;
  }

  public async lowPrompt(
    lowContent: z.infer<typeof LowContentSchema>,
    config: PromptConfig = {},
  ): Promise<string> {
    const parsedContent = LowContentSchema.parse(lowContent);

    parsedContent.forEach((content, index) => {
      this.validateInput(content, `lowPrompt-content-${index}`);
    });

    const sanitizedContent = parsedContent
      .map((t) => this.sanitizeText(t))
      .filter((item) => item.length > 0);
    const defaultConfig: PromptConfig = {
      version: '1.0.0',
      maxLength: 1000,
      tone: 'formal',
      temperature: 0,
      truncateStrategy: 'truncate-context',
      language: 'english',
      jurisdiction: 'india',
      logStats: true,
      truncateBuffer: 200,
    };

    const finalConfig = { ...defaultConfig, ...config };
    try {
      this.validateConfig(finalConfig);
    } catch (e) {
      this.logger.error(
        { error: e, config: finalConfig },
        'Invalid low prompt configuration.',
      );
      throw e;
    }

    const content = this.formatLowLevelContext(sanitizedContent);
    let prompt = this.buildLowLevelPrompt(finalConfig, content);

    const initialTokens = await this.countTokensCached(prompt);
    if (initialTokens > finalConfig.maxLength!) {
      this.logger.warn(
        { initialTokens, maxLength: finalConfig.maxLength },
        'Low prompt exceeds max length. Starting truncation.',
      );
      const overflow = initialTokens - finalConfig.maxLength!;
      const buffer = finalConfig.truncateBuffer ?? 0;

      const truncated = await this.truncateContextSection(
        content,
        overflow,
        buffer,
      );
      prompt = this.replaceInPrompt(prompt, content, truncated);

      const finalTokens = await this.countTokensCached(prompt);
      if (finalTokens > finalConfig.maxLength!) {
        this.logger.error(
          { finalTokens, maxLength: finalConfig.maxLength },
          'Low prompt still exceeds maxLength after truncation.',
        );
        throw new Error('Low prompt still exceeds maxLength after truncation');
      }
    }

    if (finalConfig.logStats) {
      const finalTokens = await this.countTokensCached(prompt);
      this.logger.info(
        {
          version: finalConfig.version,
          length: prompt.length,
          tokens: finalTokens,
          tone: finalConfig.tone,
          language: finalConfig.language,
          jurisdiction: finalConfig.jurisdiction,
          inputCount: sanitizedContent.length,
        },
        'Low Prompt Generated',
      );
    }

    return prompt;
  }

  public async createSummarizationPrompt(
    opts: { text: string },
    config: PromptConfig = {},
  ): Promise<string> {
    this.logger.info('Creating summarization prompt.');

    this.validateInput(opts.text, 'createSummarizationPrompt-text');

    const sanitizedText = this.sanitizeText(opts.text);

    // Default configuration for summarization prompts
    const defaultConfig: PromptConfig = {
      version: '1.0.0',
      maxLength: 4000,
      tone: 'formal',
      temperature: 0,
      truncateStrategy: 'truncate-context',
      language: 'english',
      jurisdiction: 'india',
      logStats: true,
      truncateBuffer: 200,
    };

    const finalConfig = { ...defaultConfig, ...config };
    try {
      this.validateConfig(finalConfig);
    } catch (e) {
      this.logger.error(
        { error: e, config: finalConfig },
        'Invalid summarization prompt configuration.',
      );
      throw e;
    }

    let prompt = `
Extract all legal clauses from the following text, including nested clauses and cross-references, relevant to Indian law:

${sanitizedText}

Return the clauses as a JSON array. Each clause should include the section number and the text of the clause. If no clauses are found, return an empty array. Example:
[
  {"section": "Section 1.1", "text": "The agreement shall commence on..."},
  {"section": "Section 1.2", "text": "Subject to Section 1.1, the party shall..."}
]
`.trim();

    const initialTokens = await this.countTokensCached(prompt);
    if (initialTokens > finalConfig.maxLength!) {
      this.logger.warn(
        { initialTokens, maxLength: finalConfig.maxLength },
        'Summarization prompt exceeds max length. Starting truncation.',
      );

      const overflow = initialTokens - finalConfig.maxLength!;
      const buffer = finalConfig.truncateBuffer ?? 0;
      const textTokens = await this.countTokensCached(sanitizedText);
      const targetTokens = Math.max(0, textTokens - overflow - buffer);

      const truncatedText = await this.truncateByTokens(
        sanitizedText,
        targetTokens,
        'truncate-context',
      );

      if (sanitizedText.length > 0) {
        prompt = prompt.replace(sanitizedText, truncatedText);
      }

      const truncatedTokens = await this.countTokensCached(truncatedText);
      this.logger.info(
        {
          originalLength: sanitizedText.length,
          truncatedLength: truncatedText.length,
          originalTokens: textTokens,
          truncatedTokens: truncatedTokens,
        },
        'Text truncated for summarization prompt.',
      );

      const finalTokens = await this.countTokensCached(prompt);
      if (finalTokens > finalConfig.maxLength!) {
        this.logger.error(
          { finalTokens, maxLength: finalConfig.maxLength },
          'Summarization prompt still exceeds maxLength after truncation.',
        );
        throw new Error(
          'Summarization prompt still exceeds maxLength after truncation',
        );
      }
    }

    if (finalConfig.logStats) {
      const finalTokens = await this.countTokensCached(prompt);
      this.logger.info(
        {
          version: finalConfig.version,
          length: prompt.length,
          tokens: finalTokens,
          tone: finalConfig.tone,
          language: finalConfig.language,
          jurisdiction: finalConfig.jurisdiction,
          inputLength: sanitizedText.length,
        },
        'Summarization Prompt Generated',
      );
    }

    return prompt;
  }

  public generateOptimizedSearchPrompt(userQuestion: string): string {
    this.validateInput(userQuestion, 'generateOptimizedSearchPrompt-question');

    const sanitizedQuestion = sanitizeInput(userQuestion);
    this.logger.info(
      {
        originalLength: userQuestion.length,
        sanitizedLength: sanitizedQuestion.length,
      },
      'Creating optimized search prompt.',
    );
    return `
Rewrite the following user question as a single, concise search query optimized for a search engine, 
focusing on Indian legal information. Use keywords and core legal concepts, avoiding conversational words. 
If the question is vague, include clarifying keywords based on Indian legal context.

User question: "${sanitizedQuestion}"

Optimized search query:
`.trim();
  }

  /**
   * Builds the prompt header with system instructions
   */
  private buildPromptHeader(config: PromptConfig): string {
    return `=== SYSTEM INSTRUCTION ===
Version: ${config.version}
Role: You are an AI Legal Assistant for ${config.jurisdiction} law. Answer questions based solely on the provided CONTEXT and CHAT HISTORY.
Constraints:
- Do NOT use external knowledge or make assumptions.
- Respond with "I don't know" if the answer is not in the context.
- Never fabricate laws, clauses, or legal interpretations.
- Quote laws, sections, or clauses verbatim when referenced.
- Keep answers concise, accurate, and legally correct for Indian jurisdiction.
- Use a ${config.tone} tone.
- Only answer questions related to ${config.jurisdiction} law.
- For ambiguous questions, ask for clarification within the response.
- Respond in ${config.language}.
- Temperature: ${config.temperature}.`;
  }

  /**
   * Formats the context section of the prompt
   */
  private formatContextSection(sanitizedContext: string): string {
    return `=== CONTEXT ===
${sanitizedContext}`;
  }

  /**
   * Formats the history section of the prompt
   */
  private formatHistorySection(sanitizedHistory: string): string {
    return `=== CHAT HISTORY ===
${sanitizedHistory}`;
  }

  /**
   * Applies truncation logic to the prompt
   */
  private async applyTruncation(
    prompt: string,
    config: PromptConfig,
    sanitizedHistory: string,
    sanitizedContext: string,
  ): Promise<string> {
    const initialTokens = await this.countTokensCached(prompt);
    if (initialTokens <= config.maxLength!) {
      return prompt;
    }

    this.logger.warn(
      { initialTokens, maxLength: config.maxLength },
      'Prompt exceeds max length. Starting truncation.',
    );

    const overflow = initialTokens - config.maxLength!;
    const buffer = config.truncateBuffer ?? 0;

    let truncatedText: string;
    if (config.truncateStrategy === 'truncate-history') {
      truncatedText = await this.truncateHistorySection(
        sanitizedHistory,
        overflow,
        buffer,
      );
      return this.replaceInPrompt(prompt, sanitizedHistory, truncatedText);
    } else if (config.truncateStrategy === 'truncate-context') {
      truncatedText = await this.truncateContextSection(
        sanitizedContext,
        overflow,
        buffer,
      );
      return this.replaceInPrompt(prompt, sanitizedContext, truncatedText);
    } else if (config.truncateStrategy === 'error') {
      this.logger.error(
        "Prompt exceeds max length with 'error' truncation strategy.",
      );
      throw new Error('Prompt exceeds max length');
    }

    return prompt;
  }

  /**
   * Truncates the history section
   */
  private async truncateHistorySection(
    sanitizedHistory: string,
    overflow: number,
    buffer: number,
  ): Promise<string> {
    const historyTokens = await this.countTokensCached(sanitizedHistory);
    const estimatedCharLimit = Math.ceil(
      (historyTokens - overflow - buffer) * this.CHARS_PER_TOKEN,
    );
    const preTruncatedHistory = this.preTruncateByCharacters(
      sanitizedHistory,
      estimatedCharLimit,
      'truncate-history',
    );

    const preTruncatedTokens =
      await this.countTokensCached(preTruncatedHistory);
    const targetTokens = Math.max(0, preTruncatedTokens - overflow - buffer);
    return await this.truncateByTokens(
      preTruncatedHistory,
      targetTokens,
      'truncate-history',
    );
  }

  /**
   * Truncates the context section
   */
  private async truncateContextSection(
    sanitizedContext: string,
    overflow: number,
    buffer: number,
  ): Promise<string> {
    const contextTokens = await this.countTokensCached(sanitizedContext);
    const estimatedCharLimit = Math.ceil(
      (contextTokens - overflow - buffer) * this.CHARS_PER_TOKEN,
    );
    const preTruncatedContext = this.preTruncateByCharacters(
      sanitizedContext,
      estimatedCharLimit,
      'truncate-context',
    );

    const preTruncatedTokens =
      await this.countTokensCached(preTruncatedContext);
    const targetTokens = Math.max(0, preTruncatedTokens - overflow - buffer);
    return await this.truncateByTokens(
      preTruncatedContext,
      targetTokens,
      'truncate-context',
    );
  }

  /**
   * Safely replaces text in prompt
   */
  private replaceInPrompt(
    prompt: string,
    originalText: string,
    replacementText: string,
  ): string {
    if (originalText.length === 0) {
      return prompt;
    }

    let startIndex = 0;
    while (true) {
      const index = prompt.indexOf(originalText, startIndex);
      if (index === -1) break;

      prompt =
        prompt.slice(0, index) +
        replacementText +
        prompt.slice(index + originalText.length);
      startIndex = index + replacementText.length;
    }
    return prompt;
  }

  /**
   * Formats low-level context for summarization
   */
  private formatLowLevelContext(sanitizedContent: string[]): string {
    return sanitizedContent.length > 0
      ? sanitizedContent.join('\n\n')
      : '(No content provided)';
  }

  /**
   * Builds low-level prompt structure
   */
  private buildLowLevelPrompt(config: PromptConfig, content: string): string {
    return `=== SYSTEM INSTRUCTION ===
Version: ${config.version}
Role: Summarize the provided text into a concise, legally accurate context for a Q&A system focused on ${config.jurisdiction} law.
Constraints:
- Retain key facts, clauses, obligations, penalties, and definitions relevant to legal reasoning.
- Remove redundancies and irrelevant details.
- Preserve exact wording for legal citations, sections, or clauses.
- Use a ${config.tone} tone.
- Only summarize content relevant to ${config.jurisdiction} law.
- Respond in ${config.language}.
- Temperature: ${config.temperature}.

=== CONTENT TO SUMMARIZE ===
${content}

=== SUMMARY ===
`.trim();
  }

  /**
   * Validates question length
   */
  private validateQuestionLength(input: string): void {
    if (input.length > MAX_INPUT_SIZE) {
      throw new ResourceExhaustedError(
        'input size',
        MAX_INPUT_SIZE,
        input.length,
      );
    }
  }

  /**
   * Validates context length and content
   */
  private validateContextLength(input: string): void {
    if (input.length > MAX_INPUT_SIZE) {
      throw new ResourceExhaustedError(
        'input size',
        MAX_INPUT_SIZE,
        input.length,
      );
    }

    // Check for null bytes and control characters
    if (
      input.includes('\0') ||
      // eslint-disable-next-line no-control-regex
      /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(input)
    ) {
      throw new SecurityError(
        'Input contains null bytes or control characters',
      );
    }

    // Check for zero-width characters that could be used for obfuscation
    if (/[\u200B-\u200D\uFEFF]/.test(input)) {
      throw new SecurityError(
        'Input contains zero-width characters that could be used for obfuscation',
      );
    }
  }

  /**
   * Validates input size and content for security
   */
  private validateInput(input: string, context: string): void {
    this.validateQuestionLength(input);
    this.validateContextLength(input);

    // Check for suspicious patterns
    for (const pattern of SUSPICIOUS_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(input)) {
        this.logger.debug(
          { pattern: pattern.source, input: input.substring(0, 100) },
          'Suspicious pattern detected',
        );
        throw new PromptInjectionError(pattern.source, input);
      }
    }

    // Check for system keywords that could break prompt structure
    const suspiciousPatterns = [
      /^SYSTEM\s+INSTRUCTION\s*:/i,
      /^CONTEXT\s*:/i,
      /^ANSWER\s*:/i,
      /^ROLE\s*:/i,
      /^CONSTRAINTS\s*:/i,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(input)) {
        throw new PromptInjectionError(
          `System keyword pattern detected: ${pattern.source}`,
          input,
        );
      }
    }

    this.logger.debug(
      { inputLength: input.length, context },
      'Input validation passed',
    );
  }

  /**
   * Cached token counting for performance
   */
  private async countTokensCached(text: string): Promise<number> {
    if (this.tokenCache.has(text)) {
      return this.tokenCache.get(text)!;
    }

    // Reset counter if time window has expired
    const now = Date.now();
    if (now - this.tokenizationWindowStart > TOKEN_WINDOW_MS) {
      this.tokenizationCount = 0;
      this.tokenizationWindowStart = now;
      this.tokenCache.clear();
    }

    if (this.tokenizationCount >= MAX_TOKEN_OPERATIONS) {
      throw new ResourceExhaustedError(
        'tokenization operations',
        MAX_TOKEN_OPERATIONS,
        this.tokenizationCount,
      );
    }

    this.tokenizationCount++;

    const tokenCount = await this.countTokensWithTimeout(text);

    this.cleanupCache();
    this.tokenCache.set(text, tokenCount);

    return tokenCount;
  }

  private async countTokensWithTimeout(text: string): Promise<number> {
    return Promise.race([
      this.tokenizer.countTokens(text),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Token counting timeout')), 5000),
      ),
    ]);
  }

  private cleanupCache(): void {
    if (this.tokenCache.size > TOKEN_CACHE_SIZE) {
      const entries = Array.from(this.tokenCache.entries());
      const toRemove = entries.slice(0, Math.floor(TOKEN_CACHE_SIZE * 0.2));
      toRemove.forEach(([key]) => this.tokenCache.delete(key));
    }
  }

  /**
   * Character-based estimation for early rejection
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / this.CHARS_PER_TOKEN);
  }

  /**
   * Early character-based truncation for performance optimization
   * Used before expensive token counting to reduce processing time
   */
  private preTruncateByCharacters(
    text: string,
    maxCharacters: number,
    strategy: 'truncate-history' | 'truncate-context',
  ): string {
    // If text is already small enough, no need to truncate
    if (text.length <= maxCharacters) return text;

    this.logger.debug(
      {
        strategy,
        maxCharacters,
        originalLength: text.length,
        estimatedTokens: this.estimateTokens(text),
      },
      'Pre-truncating text by character count for performance',
    );

    // Use character-based truncation for quick estimation
    return this.truncateText(text, maxCharacters, strategy);
  }

  /**
   * Truncates history by removing lines from the beginning
   */
  private truncateHistory(text: string, maxLength: number): string {
    const lines = text.split('\n').filter(Boolean);
    while (lines.join('\n').length > maxLength && lines.length > 1) {
      lines.shift();
    }
    const truncated = lines.join('\n') || '(Truncated to empty history)';
    this.logger.debug(
      { truncatedLength: truncated.length },
      'History truncated.',
    );
    return truncated;
  }

  /**
   * Builds context by prioritizing important sentences
   */
  private buildPrioritizedContext(
    sentences: string[],
    maxLength: number,
    priorityRegex: RegExp,
  ): string {
    let result = '';
    for (const sentence of sentences.reverse()) {
      if (result.length + sentence.length <= maxLength) {
        result = sentence + ' ' + result;
      } else if (sentence.match(priorityRegex)) {
        if (result.length + sentence.length <= maxLength + 100) {
          result = sentence + ' ' + result;
        }
      }
    }
    return result;
  }

  /**
   * Trims result to fit within effective max length using boundary detection
   */
  private trimToBoundary(result: string, effectiveMaxLength: number): string {
    const boundaryRegex = /[\s.!?;:]/g;
    let lastBoundaryIndex = -1;
    let match;

    while ((match = boundaryRegex.exec(result)) !== null) {
      if (match.index <= effectiveMaxLength) {
        lastBoundaryIndex = match.index;
      } else {
        break;
      }
    }

    if (lastBoundaryIndex > 0) {
      return result.substring(0, lastBoundaryIndex);
    } else {
      return result.substring(0, effectiveMaxLength);
    }
  }

  /**
   * Truncates context with priority sentence handling
   */
  private truncateContext(text: string, maxLength: number): string {
    const priorityRegex =
      /(Section|Clause|Article|Definition|Preamble)\s+\d+\.\d+/gi;
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    let result = this.buildPrioritizedContext(
      sentences,
      maxLength,
      priorityRegex,
    );

    // Smart trimming logic that respects priority sentences and word boundaries
    if (result.length > maxLength) {
      const hasPrioritySentences = priorityRegex.test(result);
      const effectiveMaxLength = hasPrioritySentences
        ? maxLength + 100
        : maxLength;

      if (result.length > effectiveMaxLength) {
        result = this.trimToBoundary(result, effectiveMaxLength);
      }
    }

    const truncated = result.trim() || '(Truncated to empty context)';
    this.logger.debug(
      {
        truncatedLength: truncated.length,
        hasPrioritySentences: priorityRegex.test(truncated),
        originalLength: result.length,
      },
      'Context truncated with boundary-aware trimming.',
    );
    return truncated;
  }

  private truncateText(
    text: string,
    maxLength: number,
    strategy: 'truncate-history' | 'truncate-context',
  ): string {
    if (text.length <= maxLength) return text;
    this.logger.info(
      { strategy, maxLength, originalLength: text.length },
      'Truncating text by character count.',
    );

    if (strategy === 'truncate-history') {
      return this.truncateHistory(text, maxLength);
    }

    if (strategy === 'truncate-context') {
      return this.truncateContext(text, maxLength);
    }

    this.logger.warn({ strategy }, 'Unknown truncation strategy.');
    return text;
  }

  /**
   * Truncates history by tokens
   */
  private async truncateHistoryByTokens(
    text: string,
    maxTokens: number,
  ): Promise<string> {
    const lines = text.split('\n').filter(Boolean);
    const kept: string[] = [];
    let used = 0;

    // Process lines from newest to oldest (reverse order)
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const lineTokens = await this.countTokensCached(line);

      if (used + lineTokens <= maxTokens) {
        kept.unshift(line);
        used += lineTokens;
      } else {
        break;
      }
    }

    const result = kept.join('\n') || '(Truncated to empty history)';
    this.logger.debug(
      {
        truncatedLength: result.length,
        keptLines: kept.length,
        totalLines: lines.length,
        usedTokens: used,
      },
      'History truncated by tokens.',
    );
    return result;
  }

  /**
   * Truncates context by tokens with priority preservation
   */
  private async truncateContextByTokens(
    text: string,
    maxTokens: number,
  ): Promise<string> {
    const priorityRegex =
      /(Section|Clause|Article|Definition|Preamble)\s+\d+\.\d+/gi;
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);

    if (await this.checkFirstSentenceLimit(sentences, maxTokens)) {
      return '(Content truncated - first sentence exceeded token limit)';
    }

    const { kept, used, hasPriorityContent } = await this.processSentences(
      sentences,
      maxTokens,
      priorityRegex,
    );

    return this.buildTruncatedResult(
      kept,
      used,
      hasPriorityContent || false,
      sentences.length,
    );
  }

  private async checkFirstSentenceLimit(
    sentences: string[],
    maxTokens: number,
  ): Promise<boolean> {
    if (sentences.length > 0) {
      const firstSentenceTokens = await this.countTokensCached(sentences[0]);
      return firstSentenceTokens > maxTokens;
    }
    return false;
  }

  private async processSentences(
    sentences: string[],
    maxTokens: number,
    priorityRegex: RegExp,
  ): Promise<{ kept: string[]; used: number; hasPriorityContent: boolean }> {
    const kept: string[] = [];
    let used = 0;
    let hasPriorityContent = false;

    for (let i = sentences.length - 1; i >= 0; i--) {
      const sentence = sentences[i];
      const sentenceTokens = await this.countTokensCached(sentence);
      const isPriority = sentence.match(priorityRegex);

      if (this.canAddSentence(used, sentenceTokens, maxTokens, isPriority)) {
        kept.unshift(sentence);
        used += sentenceTokens;
        if (isPriority) hasPriorityContent = true;
      } else {
        break;
      }
    }

    return { kept, used, hasPriorityContent };
  }

  private canAddSentence(
    used: number,
    sentenceTokens: number,
    maxTokens: number,
    isPriority: RegExpMatchArray | null,
  ): boolean {
    if (used + sentenceTokens <= maxTokens) {
      return true;
    }
    return Boolean(isPriority) && used + sentenceTokens <= maxTokens + 50;
  }

  private buildTruncatedResult(
    kept: string[],
    used: number,
    hasPriorityContent: boolean,
    totalSentences: number,
  ): string {
    const result = kept.join(' ').trim() || '(Truncated to empty context)';
    this.logger.debug(
      {
        truncatedLength: result.length,
        keptSentences: kept.length,
        totalSentences,
        usedTokens: used,
        hasPriorityContent,
      },
      'Context truncated by tokens with priority preservation.',
    );
    return result;
  }

  /**
   * Encodes and truncates text by tokens
   */
  private async encodeAndTruncate(
    text: string,
    maxTokens: number,
    strategy: 'truncate-history' | 'truncate-context',
  ): Promise<string> {
    this.logger.info(
      { strategy, maxTokens, originalLength: text.length },
      'Truncating text by token count.',
    );

    if (strategy === 'truncate-history') {
      return await this.truncateHistoryByTokens(text, maxTokens);
    }

    if (strategy === 'truncate-context') {
      return await this.truncateContextByTokens(text, maxTokens);
    }

    this.logger.warn({ strategy }, 'Unknown truncation strategy.');
    return text;
  }

  private async truncateByTokens(
    text: string,
    maxTokens: number,
    strategy: 'truncate-history' | 'truncate-context',
  ): Promise<string> {
    return await this.encodeAndTruncate(text, maxTokens, strategy);
  }

  private validateConfig(config: PromptConfig) {
    if (
      !config.language ||
      !ALLOWED_LANGUAGES.includes(
        config.language.toLowerCase() as AllowedLanguage,
      )
    ) {
      throw new ValidationError(
        'language',
        config.language,
        'Only English is supported',
      );
    }
    if (
      config.jurisdiction &&
      !ALLOWED_JURISDICTIONS.includes(
        config.jurisdiction.toLowerCase() as AllowedJurisdiction,
      )
    ) {
      throw new ValidationError(
        'jurisdiction',
        config.jurisdiction,
        'Only Indian jurisdiction is supported',
      );
    }
    if (config.tone && !ALLOWED_TONES.includes(config.tone as AllowedTone)) {
      throw new ValidationError(
        'tone',
        config.tone,
        'Only formal, casual, or professional tones are supported',
      );
    }
  }
}
