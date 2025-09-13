import { createLogger, transports, format } from "winston";
import { z } from "zod";
import { PromptConfig } from "../types";
import { LowContentSchema } from "../schemas/low-content.schema";
import { UserInputSchema } from "../schemas/user-input.schema";
import { AutoTokenizer } from "@xenova/transformers";

export class PromptService {
  private logger;
  private tokenizer: any;

  constructor() {
    this.logger = createLogger({
      level: "debug",
      format: format.combine(format.timestamp(), format.json()),
      transports: [new transports.Console()],
    });
    this.initializeTokenizer();
  }

  private async initializeTokenizer() {
    try {
      this.tokenizer = await AutoTokenizer.from_pretrained(
        process.env.HUGGINGFACE_CHAT_MODEL!
      );
    } catch (error) {
      this.logger.error("Failed to initialize tokenizer", { error });
    }
  }

  public sanitizeText(input: string): string {
    return input
      .normalize("NFKC")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[\r\t]+/g, " ")
      .replace(/\n+/g, "\n")
      .replace(/(\bignore previous instructions\b)/gi, "")
      .replace(/(\bdo anything\b)/gi, "")
      .trim();
  }

  private estimateTokens(text: string): number {
    if (!this.tokenizer) return Math.ceil(text.length / 4);
    const tokens = this.tokenizer.encode(text);
    return tokens.length;
  }

  private truncateText(
    text: string,
    maxLength: number,
    strategy: "truncate-history" | "truncate-context"
  ): string {
    if (text.length <= maxLength) return text;

    if (strategy === "truncate-history") {
      const lines = text.split("\n").filter(Boolean);
      while (lines.join("\n").length > maxLength && lines.length > 1) {
        lines.shift();
      }
      return lines.join("\n") || "(Truncated to empty history)";
    }

    if (strategy === "truncate-context") {
      const priorityRegex =
        /(Section|Clause|Article|Definition|Preamble)\s+\d+\.\d+/gi;
      const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
      let result = "";
      for (const sentence of sentences.reverse()) {
        if (result.length + sentence.length <= maxLength) {
          result = sentence + " " + result;
        } else if (sentence.match(priorityRegex)) {
          if (result.length + sentence.length <= maxLength + 100) {
            result = sentence + " " + result;
          }
        }
      }
      if (result.length > maxLength) {
        result = result.slice(0, maxLength);
      }
      return result.trim() || "(Truncated to empty context)";
    }

    return text;
  }

  private truncateByTokens(
    text: string,
    maxTokens: number,
    strategy: "truncate-history" | "truncate-context"
  ): string {
    if (!this.tokenizer) {
      // heuristic fallback: ~4 chars per token
      return this.truncateText(text, maxTokens * 4, strategy);
    }
    if (strategy === "truncate-history") {
      const lines = text.split("\n").filter(Boolean);
      const kept: string[] = [];
      let used = 0;
      for (let i = lines.length - 1; i >= 0; i--) {
        const t = this.estimateTokens(lines[i]);
        if (used + t > maxTokens && kept.length > 0) break;
        kept.unshift(lines[i]);
        used += t;
      }
      return kept.join("\n");
    }
    // truncate-context: accumulate sentences from the end with priority bias
    const priorityRegex =
      /(Section|Clause|Article|Definition|Preamble)\s+\d+(?:\.\d+)*/i;
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean).reverse();
    const kept: string[] = [];
    let used = 0;
    for (const s of sentences) {
      const t = this.estimateTokens(s);
      const fits = used + t <= maxTokens;
      const prioritized = priorityRegex.test(s);
      if (fits || (prioritized && used < maxTokens)) {
        kept.push(s);
        used += t;
        if (used >= maxTokens) break;
      }
    }
    return kept.reverse().join(" ").trim();
  }

  private validateConfig(config: PromptConfig) {
    if (config.language !== "english")
      throw new Error("Only English language is supported");
    if (config.jurisdiction && config.jurisdiction !== "INDIA")
      throw new Error("Only Indian jurisdiction is supported");
  }

  public mainPrompt(
    input: z.infer<typeof UserInputSchema>,
    config: PromptConfig = {}
  ): string {
    const parsedInput = UserInputSchema.parse(input);

    const sanitizedContext = this.sanitizeText(parsedInput.context);
    const sanitizedQuestion = this.sanitizeText(parsedInput.question);
    const sanitizedHistory = this.sanitizeText(
      parsedInput.chatHistory.join("\n")
    );

    const defaultConfig: PromptConfig = {
      version: "1.0.0",
      maxLength: 8000,
      tone: "formal",
      temperature: 0,
      truncateStrategy: "truncate-context",
      language: "english",
      jurisdiction: "INDIA",
      logStats: true,
      truncateBuffer: 500,
    };

    const finalConfig = { ...defaultConfig, ...config };
    this.validateConfig(finalConfig);

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

    if (this.estimateTokens(prompt) > finalConfig.maxLength!) {
      const overflow = this.estimateTokens(prompt) - finalConfig.maxLength!;
      const buffer = finalConfig.truncateBuffer ?? 0;
      if (finalConfig.truncateStrategy === "truncate-history") {
        const targetTokens = Math.max(
          0,
          this.estimateTokens(sanitizedHistory) - overflow - buffer
        );
        const truncated = this.truncateByTokens(
          sanitizedHistory,
          targetTokens,
          "truncate-history"
        );
        prompt = prompt.replace(sanitizedHistory, truncated);
      } else if (finalConfig.truncateStrategy === "truncate-context") {
        const targetTokens = Math.max(
          0,
          this.estimateTokens(sanitizedContext) - overflow - buffer
        );
        const truncated = this.truncateByTokens(
          sanitizedContext,
          targetTokens,
          "truncate-context"
        );
        prompt = prompt.replace(sanitizedContext, truncated);
      } else if (finalConfig.truncateStrategy === "error") {
        throw new Error("Prompt exceeds max length");
      }
      if (this.estimateTokens(prompt) > finalConfig.maxLength!) {
        throw new Error("Prompt still exceeds maxLength after truncation");
      }
    }

    if (finalConfig.logStats) {
      this.logger.debug("Main Prompt Generated", {
        version: finalConfig.version,
        length: prompt.length,
        tokens: this.estimateTokens(prompt),
        tone: finalConfig.tone,
        language: finalConfig.language,
        jurisdiction: finalConfig.jurisdiction,
        questionLength: sanitizedQuestion.length,
      });
    }

    return prompt;
  }

  public lowPrompt(
    lowContent: z.infer<typeof LowContentSchema>,
    config: PromptConfig = {}
  ): string {
    const parsedContent = LowContentSchema.parse(lowContent);
    const sanitizedContent = parsedContent
      .map(this.sanitizeText)
      .filter((item) => item.length > 0);
    const defaultConfig: PromptConfig = {
      version: "1.0.0",
      maxLength: 1000,
      tone: "formal",
      temperature: 0,
      truncateStrategy: "truncate-context",
      language: "english",
      jurisdiction: "INDIA",
      logStats: true,
      truncateBuffer: 200,
    };

    const finalConfig = { ...defaultConfig, ...config };
    this.validateConfig(finalConfig);

    const content =
      sanitizedContent.length > 0
        ? sanitizedContent.join("\n\n")
        : "(No content provided)";

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

    if (this.estimateTokens(prompt) > finalConfig.maxLength!) {
      const overflow = this.estimateTokens(prompt) - finalConfig.maxLength!;
      const buffer = finalConfig.truncateBuffer ?? 0;
      const targetLen = Math.max(
        0,
        this.estimateTokens(content) - overflow - buffer
      );
      const truncated = this.truncateText(
        content,
        targetLen,
        "truncate-context"
      );
      prompt = prompt.replace(content, truncated);
      if (this.estimateTokens(prompt) > finalConfig.maxLength!) {
        throw new Error("Low prompt still exceeds maxLength after truncation");
      }
    }

    if (finalConfig.logStats) {
      this.logger.debug("Low Prompt Generated", {
        version: finalConfig.version,
        length: prompt.length,
        tokens: this.estimateTokens(prompt),
        tone: finalConfig.tone,
        language: finalConfig.language,
        jurisdiction: finalConfig.jurisdiction,
        inputCount: sanitizedContent.length,
      });
    }

    return prompt;
  }

  public createSummarizationPrompt(opts: { text: string }): string {
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
    return `
Rewrite the following user question as a single, concise search query optimized for a search engine, 
focusing on Indian legal information. Use keywords and core legal concepts, avoiding conversational words. 
If the question is vague, include clarifying keywords based on Indian legal context.

User question: "${userQuestion}"

Optimized search query:
`.trim();
  }
}
