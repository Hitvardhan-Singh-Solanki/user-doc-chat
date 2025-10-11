import { z } from 'zod';
import { PromptConfig } from '@shared/types';
import { LowContentSchema } from '@files/validators/file-input.validator';
import { UserInputSchema } from '@auth/validators/user-input.validator';
import { logger } from '@config/logger.config';
import { ITokenizer } from '@interfaces/tokenizer.interface';
import { sanitizeInput } from '@shared/utils';
import {
  ALLOWED_JURISDICTIONS,
  ALLOWED_LANGUAGES,
  ALLOWED_TONES,
  type AllowedJurisdiction,
  type AllowedLanguage,
  type AllowedTone,
  MAX_INPUT_SIZE,
  MAX_TOKEN_OPERATIONS,
  SUSPICIOUS_PATTERNS,
  TOKEN_CACHE_SIZE,
  TOKEN_WINDOW_MS,
} from '@config/prompt.config';
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

    let prompt = `
=== SYSTEM INSTRUCTION ===
Version: ${finalConfig.version}
Role: You are an AI Legal Assistant for ${finalConfig.jurisdiction} law. Answer questions based solely on the provided CONTEXT and CHAT HISTORY.
Constraints:
- Do NOT use external knowledge or make assumptions.
- Respond with "I don't know" if the answer is not in the context.
- Never fabricate laws, clauses, or legal interpretations.
- Quote laws, sections, or clauses verbatim when referenced.
- Keep answers concise, accurate, and legally correct for Indian jurisdiction.
- Use a ${finalConfig.tone} tone.
- Only answer questions related to ${finalConfig.jurisdiction} law.
- For ambiguous questions, ask for clarification within the response.
- Respond in ${finalConfig.language}.
- Temperature: ${finalConfig.temperature}.

=== CHAT HISTORY ===
${sanitizedHistory}

=== CONTEXT ===
${sanitizedContext}

=== USER QUESTION ===
${sanitizedQuestion}

=== ANSWER ===
`.trim();

    const initialTokens = await this.countTokensCached(prompt);
    if (initialTokens > finalConfig.maxLength!) {
      this.logger.warn(
        { initialTokens, maxLength: finalConfig.maxLength },
        'Prompt exceeds max length. Starting truncation.',
      );
      const overflow = initialTokens - finalConfig.maxLength!;
      const buffer = finalConfig.truncateBuffer ?? 0;

      let truncatedText: string;
      if (finalConfig.truncateStrategy === 'truncate-history') {
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
        const targetTokens = Math.max(
          0,
          preTruncatedTokens - overflow - buffer,
        );
        truncatedText = await this.truncateByTokens(
          preTruncatedHistory,
          targetTokens,
          'truncate-history',
        );
        if (sanitizedHistory.length > 0) {
          // Safe substring replacement to avoid regex/partial-match problems
          let startIndex = 0;
          while (true) {
            const index = prompt.indexOf(sanitizedHistory, startIndex);
            if (index === -1) break;

            prompt =
              prompt.slice(0, index) +
              truncatedText +
              prompt.slice(index + sanitizedHistory.length);
            startIndex = index + truncatedText.length;
          }
        }
      } else if (finalConfig.truncateStrategy === 'truncate-context') {
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
        const targetTokens = Math.max(
          0,
          preTruncatedTokens - overflow - buffer,
        );
        truncatedText = await this.truncateByTokens(
          preTruncatedContext,
          targetTokens,
          'truncate-context',
        );
        if (sanitizedContext.length > 0) {
          // Safe substring replacement to avoid regex/partial-match problems
          let startIndex = 0;
          while (true) {
            const index = prompt.indexOf(sanitizedContext, startIndex);
            if (index === -1) break;

            prompt =
              prompt.slice(0, index) +
              truncatedText +
              prompt.slice(index + sanitizedContext.length);
            startIndex = index + truncatedText.length;
          }
        }
      } else if (finalConfig.truncateStrategy === 'error') {
        this.logger.error(
          "Prompt exceeds max length with 'error' truncation strategy.",
        );
        throw new Error('Prompt exceeds max length');
      }

      const finalTokens = await this.countTokensCached(prompt);
      if (finalTokens > finalConfig.maxLength!) {
        // FIX: Corrected log order
        this.logger.error(
          { finalTokens, maxLength: finalConfig.maxLength },
          'Prompt still exceeds maxLength after truncation.',
        );
        throw new Error('Prompt still exceeds maxLength after truncation');
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

    const content =
      sanitizedContent.length > 0
        ? sanitizedContent.join('\n\n')
        : '(No content provided)';

    let prompt = `
=== SYSTEM INSTRUCTION ===
Version: ${finalConfig.version}
Role: Summarize the provided text into a concise, legally accurate context for a Q&A system focused on ${finalConfig.jurisdiction} law.
Constraints:
- Retain key facts, clauses, obligations, penalties, and definitions relevant to legal reasoning.
- Remove redundancies and irrelevant details.
- Preserve exact wording for legal citations, sections, or clauses.
- Use a ${finalConfig.tone} tone.
- Only summarize content relevant to ${finalConfig.jurisdiction} law.
- Respond in ${finalConfig.language}.
- Temperature: ${finalConfig.temperature}.

=== CONTENT TO SUMMARIZE ===
${content}

=== SUMMARY ===
`.trim();

    const initialTokens = await this.countTokensCached(prompt);
    if (initialTokens > finalConfig.maxLength!) {
      this.logger.warn(
        { initialTokens, maxLength: finalConfig.maxLength },
        'Low prompt exceeds max length. Starting truncation.',
      );
      const overflow = initialTokens - finalConfig.maxLength!;
      const buffer = finalConfig.truncateBuffer ?? 0;

      const contentTokens = await this.countTokensCached(content);
      const estimatedCharLimit = Math.ceil(
        (contentTokens - overflow - buffer) * this.CHARS_PER_TOKEN,
      );
      const preTruncatedContent = this.preTruncateByCharacters(
        content,
        estimatedCharLimit,
        'truncate-context',
      );

      const preTruncatedTokens =
        await this.countTokensCached(preTruncatedContent);
      const targetTokens = Math.max(0, preTruncatedTokens - overflow - buffer);
      const truncated = await this.truncateByTokens(
        preTruncatedContent,
        targetTokens,
        'truncate-context',
      );
      if (content.length > 0) {
        // Safe substring replacement to avoid regex/partial-match problems
        let startIndex = 0;
        while (true) {
          const index = prompt.indexOf(content, startIndex);
          if (index === -1) break;

          prompt =
            prompt.slice(0, index) +
            truncated +
            prompt.slice(index + content.length);
          startIndex = index + truncated.length;
        }
      }

      const finalTokens = await this.countTokensCached(prompt);
      if (finalTokens > finalConfig.maxLength!) {
        // FIX: Corrected log order
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
   * Validates input size and content for security
   */
  private validateInput(input: string, context: string): void {
    // Check input size
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
    // Only flag if they appear in suspicious patterns (not just anywhere in the text)
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
    let result = this.buildPrioritizedContext(sentences, maxLength, priorityRegex);

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

  private async truncateByTokens(
    text: string,
    maxTokens: number,
    strategy: 'truncate-history' | 'truncate-context',
  ): Promise<string> {
    this.logger.info(
      { strategy, maxTokens, originalLength: text.length },
      'Truncating text by token count.',
    );

    if (strategy === 'truncate-history') {
      // For chat history, remove oldest messages first (line-based approach)
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

    if (strategy === 'truncate-context') {
      // For context, prioritize legal citations/clauses like in truncateText
      const priorityRegex =
        /(Section|Clause|Article|Definition|Preamble)\s+\d+\.\d+/gi;
      const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
      const kept: string[] = [];
      let used = 0;
      let hasPriorityContent = false;

      // Check if even the first sentence exceeds the token limit
      if (sentences.length > 0) {
        const firstSentenceTokens = await this.countTokensCached(sentences[0]);

        if (firstSentenceTokens > maxTokens) {
          return '(Content truncated - first sentence exceeded token limit)';
        }
      }

      // Process sentences in reverse order to prioritize recent content
      for (let i = sentences.length - 1; i >= 0; i--) {
        const sentence = sentences[i];
        const sentenceTokens = await this.countTokensCached(sentence);

        const isPriority = sentence.match(priorityRegex);

        if (used + sentenceTokens <= maxTokens) {
          kept.unshift(sentence);
          used += sentenceTokens;
          if (isPriority) hasPriorityContent = true;
        } else if (isPriority && used + sentenceTokens <= maxTokens + 50) {
          kept.unshift(sentence);
          used += sentenceTokens;
          hasPriorityContent = true;
        } else {
          break;
        }
      }

      const result = kept.join(' ').trim() || '(Truncated to empty context)';
      this.logger.debug(
        {
          truncatedLength: result.length,
          keptSentences: kept.length,
          totalSentences: sentences.length,
          usedTokens: used,
          hasPriorityContent,
        },
        'Context truncated by tokens with priority preservation.',
      );
      return result;
    }

    this.logger.warn({ strategy }, 'Unknown truncation strategy.');
    return text;
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
