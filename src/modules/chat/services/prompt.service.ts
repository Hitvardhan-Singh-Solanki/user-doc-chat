import { z } from 'zod';
import { PromptConfig } from '../../../common/types';
import { LowContentSchema } from '../../../modules/files/schemas/low-content.schema';
import { UserInputSchema } from '../../../modules/auth/schemas/user-input.schema';
import { logger } from '../../../config/logger';
import { ITokenizer } from '../../../common/interfaces/tokenizer.interface';

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
        prompt = prompt.replace(sanitizedHistory, truncatedText);
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
        prompt = prompt.replace(sanitizedContext, truncatedText);
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
      const targetLen = Math.max(
        0,
        this.tokenizer.countTokens(content) - overflow - buffer,
      );
      const truncated = this.truncateText(
        content,
        targetLen,
        'truncate-context',
      );
      prompt = prompt.replace(content, truncated);

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

  public createSummarizationPrompt(opts: { text: string }): string {
    this.logger.info('Creating summarization prompt.');
    return `
Extract all legal clauses from the following text, including nested clauses and cross-references, relevant to Indian law:

${opts.text}

Return the clauses as a JSON array. Each clause should include the section number and the text of the clause. If no clauses are found, return an empty array. Example:
[
  {"section": "Section 1.1", "text": "The agreement shall commence on..."},
  {"section": "Section 1.2", "text": "Subject to Section 1.1, the party shall..."}
]
`.trim();
  }

  public generateOptimizedSearchPrompt(userQuestion: string): string {
    this.logger.info(
      { questionLength: userQuestion.length },
      'Creating optimized search prompt.',
    );
    return `
Rewrite the following user question as a single, concise search query optimized for a search engine, 
focusing on Indian legal information. Use keywords and core legal concepts, avoiding conversational words. 
If the question is vague, include clarifying keywords based on Indian legal context.

User question: "${userQuestion}"

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
      if (result.length > maxLength) {
        result = result.slice(0, maxLength);
      }
      const truncated = result.trim() || '(Truncated to empty context)';
      this.logger.debug(
        { truncatedLength: truncated.length },
        'Context truncated.',
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
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    const kept: string[] = [];
    let used = 0;

    for (const s of sentences.reverse()) {
      const t = this.tokenizer.countTokens(s);
      if (used + t <= maxTokens) {
        kept.push(s);
        used += t;
      }
    }

    return kept.reverse().join(' ').trim();
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
