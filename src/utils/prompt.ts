import { createLogger, transports, format } from "winston";
import { z } from "zod";
import { PromptConfig } from "../types";

export const UserInputSchema = z.object({
  question: z.string().min(1, "Question cannot be empty").max(2000),
  context: z.string().optional().default("(No context provided)"),
  chatHistory: z.array(z.string()).optional().default([]),
});

export const LowContentSchema = z.array(z.string()).default([]);

export function sanitizeText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width chars
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[\r\t]+/g, " ")
    .replace(/\n+/g, "\n")
    .replace(/(\bignore previous instructions\b)/gi, "")
    .replace(/(\bdo anything\b)/gi, "")
    .trim();
}

const logger = createLogger({
  level: "debug",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

function estimateTokens(text: string): number {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length + Math.ceil(text.length / 8);
}

function truncateText(
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
    const priorityRegex = /(Section|Clause|Article)\s+\d+\.\d+/gi;
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
    return result.trim() + "...[truncated]";
  }

  return text;
}

// -------------------- Main Prompt --------------------
export function mainPrompt(
  input: z.infer<typeof UserInputSchema>,
  config: PromptConfig = {}
): string {
  const parsedInput = UserInputSchema.parse(input);

  const sanitizedContext = sanitizeText(parsedInput.context);
  const sanitizedQuestion = sanitizeText(parsedInput.question);
  const sanitizedHistory = sanitizeText(parsedInput.chatHistory.join("\n"));

  const defaultConfig: PromptConfig = {
    version: "1.0.0",
    maxLength: 10000,
    tone: "formal",
    temperature: 0,
    truncateStrategy: "truncate-history",
    language: "en",
    jurisdiction: "IN",
    logStats: true,
    truncateBuffer: 1000,
  };

  const finalConfig = { ...defaultConfig, ...config };

  if (finalConfig.language !== "en")
    throw new Error("Only English language is supported");
  if (finalConfig.jurisdiction && finalConfig.jurisdiction !== "IN")
    throw new Error("Only Indian jurisdiction is supported");

  let prompt = `
=== SYSTEM INSTRUCTION ===
Version: ${finalConfig.version}
Role: You are an AI Legal Assistant. Answer legal questions strictly based on the provided CONTEXT and CHAT HISTORY.
Constraints:
- Do NOT use external knowledge or make assumptions unless explicitly allowed.
- Respond with "I don't know" if the answer is not in the context.
- Never fabricate or speculate on laws or clauses.
- Quote laws, sections, or clauses verbatim when referenced.
- Keep answers concise, accurate, and legally correct.
- Use a ${finalConfig.tone} tone.
- Only answer questions related to ${finalConfig.jurisdiction} law.
- If multiple valid answers exist, summarize all options clearly.
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

  if (prompt.length > finalConfig.maxLength!) {
    const available = finalConfig.maxLength! - finalConfig.truncateBuffer!;
    if (finalConfig.truncateStrategy === "truncate-history") {
      prompt = prompt.replace(
        sanitizedHistory,
        truncateText(sanitizedHistory, available, "truncate-history")
      );
    } else if (finalConfig.truncateStrategy === "truncate-context") {
      prompt = prompt.replace(
        sanitizedContext,
        truncateText(sanitizedContext, available, "truncate-context")
      );
    } else if (finalConfig.truncateStrategy === "error") {
      throw new Error("Prompt exceeds max length");
    }
  }

  if (finalConfig.logStats) {
    logger.debug("Main Prompt Generated", {
      version: finalConfig.version,
      length: prompt.length,
      tokens: estimateTokens(prompt),
      tone: finalConfig.tone,
      language: finalConfig.language,
      jurisdiction: finalConfig.jurisdiction,
      questionLength: sanitizedQuestion.length,
    });
  }

  return prompt;
}

// -------------------- Low Prompt --------------------
export function lowPrompt(
  lowContent: z.infer<typeof LowContentSchema>,
  config: PromptConfig = {}
): string {
  const sanitizedContent = lowContent
    .map(sanitizeText)
    .filter((item) => item.length > 0);

  const defaultConfig: PromptConfig = {
    version: "1.0.0",
    maxLength: 5000,
    tone: "formal",
    temperature: 0,
    truncateStrategy: "truncate-context",
    language: "en",
    jurisdiction: "IN",
    logStats: true,
    truncateBuffer: 500,
  };
  const finalConfig = { ...defaultConfig, ...config };

  if (finalConfig.language !== "en")
    throw new Error("Only English language is supported");
  if (finalConfig.jurisdiction && finalConfig.jurisdiction !== "IN")
    throw new Error("Only Indian jurisdiction is supported");

  const content =
    sanitizedContent.length > 0
      ? sanitizedContent.join("\n\n")
      : "(No content provided)";

  let prompt = `
=== SYSTEM INSTRUCTION ===
Version: ${finalConfig.version}
Role: Summarize the provided text into a concise, legally accurate context for a Q&A system.
Constraints:
- Retain only key facts or clauses relevant to legal reasoning.
- Remove redundancies and irrelevant details.
- Preserve exact wording for legal citations where needed.
- Use a ${finalConfig.tone} tone.
- Only summarize content relevant to ${finalConfig.jurisdiction} law.
- Respond in ${finalConfig.language}.
- Temperature: ${finalConfig.temperature}.

=== CONTENT TO SUMMARIZE ===
${content}

=== SUMMARY ===
`.trim();

  if (prompt.length > finalConfig.maxLength!) {
    prompt = truncateText(
      prompt,
      finalConfig.maxLength! - finalConfig.truncateBuffer!,
      "truncate-context"
    );
  }

  if (finalConfig.logStats) {
    logger.debug("Low Prompt Generated", {
      version: finalConfig.version,
      length: prompt.length,
      tokens: estimateTokens(prompt),
      tone: finalConfig.tone,
      language: finalConfig.language,
      jurisdiction: finalConfig.jurisdiction,
      inputCount: sanitizedContent.length,
    });
  }

  return prompt;
}
