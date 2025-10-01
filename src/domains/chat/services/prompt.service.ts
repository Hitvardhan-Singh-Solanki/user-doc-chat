import { z } from 'zod';
import { PromptConfig } from '../../../shared/types';
import { LowContentSchema } from '../../../domains/files/validators/file-input.validator';
import { UserInputSchema } from '../../../domains/auth/validators/user-input.validator';
import { logger } from '../../../config/logger.config';
import { ITokenizer } from '../../../shared/interfaces/tokenizer.interface';
import { sanitizeInput } from '../../../shared/utils';

export class PromptService {
  private logger;
  private tokenizer: ITokenizer;

  constructor(tokenizer: ITokenizer) {
    this.logger = logger;
    this.tokenizer = tokenizer;
    this.logger.info('PromptService initialized.');
  }

  public sanitizeText(input: string): string {
    const sanitized = input
      .normalize('NFKC')
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

  public mainPrompt(
    input: z.infer<typeof UserInputSchema>,
    config: PromptConfig = {},
  ): string {
    const parsedInput = UserInputSchema.parse(input);
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
      jurisdiction: 'INDIA',
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

    const initialTokens = this.tokenizer.countTokens(prompt);
    if (initialTokens > finalConfig.maxLength!) {
      // FIX: Corrected log order
      this.logger.warn(
        { initialTokens, maxLength: finalConfig.maxLength },
        'Prompt exceeds max length. Starting truncation.',
      );
      const overflow = initialTokens - finalConfig.maxLength!;
      const buffer = finalConfig.truncateBuffer ?? 0;

      let truncatedText: string;
      if (finalConfig.truncateStrategy === 'truncate-history') {
        const targetTokens = Math.max(
          0,
          this.tokenizer.countTokens(sanitizedHistory) - overflow - buffer,
        );
        truncatedText = this.truncateByTokens(
          sanitizedHistory,
          targetTokens,
          'truncate-history',
        );
        // Use split/join with empty string guard to avoid infinite loops and ensure all occurrences are replaced
        if (sanitizedHistory.length > 0) {
          prompt = prompt.split(sanitizedHistory).join(truncatedText);
        }
      } else if (finalConfig.truncateStrategy === 'truncate-context') {
        const targetTokens = Math.max(
          0,
          this.tokenizer.countTokens(sanitizedContext) - overflow - buffer,
        );
        truncatedText = this.truncateByTokens(
          sanitizedContext,
          targetTokens,
          'truncate-context',
        );
        // Use split/join with empty string guard to avoid infinite loops and ensure all occurrences are replaced
        if (sanitizedContext.length > 0) {
          prompt = prompt.split(sanitizedContext).join(truncatedText);
        }
      } else if (finalConfig.truncateStrategy === 'error') {
        this.logger.error(
          "Prompt exceeds max length with 'error' truncation strategy.",
        );
        throw new Error('Prompt exceeds max length');
      }

      const finalTokens = this.tokenizer.countTokens(prompt);
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
      this.logger.info(
        {
          version: finalConfig.version,
          length: prompt.length,
          tokens: this.tokenizer.countTokens(prompt),
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

  public lowPrompt(
    lowContent: z.infer<typeof LowContentSchema>,
    config: PromptConfig = {},
  ): string {
    const parsedContent = LowContentSchema.parse(lowContent);
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
      jurisdiction: 'INDIA',
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

    const initialTokens = this.tokenizer.countTokens(prompt);
    if (initialTokens > finalConfig.maxLength!) {
      // FIX: Corrected log order
      this.logger.warn(
        { initialTokens, maxLength: finalConfig.maxLength },
        'Low prompt exceeds max length. Starting truncation.',
      );
      const overflow = initialTokens - finalConfig.maxLength!;
      const buffer = finalConfig.truncateBuffer ?? 0;
      const targetTokens = Math.max(
        0,
        this.tokenizer.countTokens(content) - overflow - buffer,
      );
      const truncated = this.truncateByTokens(
        content,
        targetTokens,
        'truncate-context',
      );
      // Use split/join with empty string guard to avoid infinite loops and ensure all occurrences are replaced
      if (content.length > 0) {
        prompt = prompt.split(content).join(truncated);
      }

      const finalTokens = this.tokenizer.countTokens(prompt);
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
      this.logger.info(
        {
          version: finalConfig.version,
          length: prompt.length,
          tokens: this.tokenizer.countTokens(prompt),
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

  public createSummarizationPrompt(
    opts: { text: string },
    config: PromptConfig = {},
  ): string {
    this.logger.info('Creating summarization prompt.');

    // Sanitize the input text
    const sanitizedText = this.sanitizeText(opts.text);

    // Default configuration for summarization prompts
    const defaultConfig: PromptConfig = {
      version: '1.0.0',
      maxLength: 4000,
      tone: 'formal',
      temperature: 0,
      truncateStrategy: 'truncate-context',
      language: 'english',
      jurisdiction: 'INDIA',
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

    // Check if prompt exceeds max length and truncate if necessary
    const initialTokens = this.tokenizer.countTokens(prompt);
    if (initialTokens > finalConfig.maxLength!) {
      this.logger.warn(
        { initialTokens, maxLength: finalConfig.maxLength },
        'Summarization prompt exceeds max length. Starting truncation.',
      );

      const overflow = initialTokens - finalConfig.maxLength!;
      const buffer = finalConfig.truncateBuffer ?? 0;
      const targetTokens = Math.max(
        0,
        this.tokenizer.countTokens(sanitizedText) - overflow - buffer,
      );

      const truncatedText = this.truncateByTokens(
        sanitizedText,
        targetTokens,
        'truncate-context',
      );

      // Use split/join with empty string guard to avoid infinite loops and ensure all occurrences are replaced
      if (sanitizedText.length > 0) {
        prompt = prompt.split(sanitizedText).join(truncatedText);
      }

      this.logger.info(
        {
          originalLength: sanitizedText.length,
          truncatedLength: truncatedText.length,
          originalTokens: this.tokenizer.countTokens(sanitizedText),
          truncatedTokens: this.tokenizer.countTokens(truncatedText),
        },
        'Text truncated for summarization prompt.',
      );

      const finalTokens = this.tokenizer.countTokens(prompt);
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
      this.logger.info(
        {
          version: finalConfig.version,
          length: prompt.length,
          tokens: this.tokenizer.countTokens(prompt),
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

    if (strategy === 'truncate-context') {
      const priorityRegex =
        /(Section|Clause|Article|Definition|Preamble)\s+\d+\.\d+/gi;
      const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
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

      // Smart trimming logic that respects priority sentences and word boundaries
      if (result.length > maxLength) {
        const hasPrioritySentences = priorityRegex.test(result);
        const effectiveMaxLength = hasPrioritySentences
          ? maxLength + 100
          : maxLength;

        if (result.length > effectiveMaxLength) {
          // Find the nearest word/sentence boundary at or below the effective max length
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

          // If we found a boundary, trim there; otherwise trim at effective max length
          if (lastBoundaryIndex > 0) {
            result = result.substring(0, lastBoundaryIndex);
          } else {
            result = result.substring(0, effectiveMaxLength);
          }
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
    this.logger.warn({ strategy }, 'Unknown truncation strategy.');
    return text;
  }

  private truncateByTokens(
    text: string,
    maxTokens: number,
    strategy: 'truncate-history' | 'truncate-context',
  ): string {
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
        const lineTokens = this.tokenizer.countTokens(line);

        if (used + lineTokens <= maxTokens) {
          kept.unshift(line); // Add to beginning to maintain chronological order
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
        const firstSentenceTokens = this.tokenizer.countTokens(sentences[0]);

        if (firstSentenceTokens > maxTokens) {
          return '(Content truncated - first sentence exceeded token limit)';
        }
      }

      // Process sentences in reverse order to prioritize recent content
      for (let i = sentences.length - 1; i >= 0; i--) {
        const sentence = sentences[i];
        const sentenceTokens = this.tokenizer.countTokens(sentence);

        const isPriority = sentence.match(priorityRegex);

        if (used + sentenceTokens <= maxTokens) {
          kept.unshift(sentence);
          used += sentenceTokens;
          if (isPriority) hasPriorityContent = true;
        } else if (isPriority && used + sentenceTokens <= maxTokens + 50) {
          // Allow slight overflow for priority legal content
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
    if (config.language !== 'english') {
      this.logger.error({ config }, 'Unsupported language.');
      throw new Error('Only English language is supported');
    }
    if (config.jurisdiction && config.jurisdiction !== 'INDIA') {
      this.logger.error({ config }, 'Unsupported jurisdiction.');
      throw new Error('Only Indian jurisdiction is supported');
    }
  }
}
