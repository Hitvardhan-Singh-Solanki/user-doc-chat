import { createLogger, transports, format } from "winston";
import { RateLimiterMemory } from "rate-limiter-flexible";

const logger = createLogger({
  level: "debug",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

const rateLimiter = new RateLimiterMemory({
  points: 100,
  duration: 60,
});

export interface PromptConfig {
  version?: string;
  maxLength?: number;
  tone?: "formal" | "neutral";
  temperature?: number; // LLM creativity control (0 = deterministic)
  truncateStrategy?: "error" | "truncate-history" | "truncate-context";
  language?: string;
  logStats?: boolean;
  truncateBuffer?: number;
}

function estimateTokens(text: string): number {
  // Mock implementation: approximate 1 token per 4 chars, adjusted for spaces
  const words = text.split(/\s+/).filter(Boolean);
  return words.length + Math.ceil(text.length / 8);
}

/**
 * Truncate text to fit within the maxLength limit.
 */
function truncateText(
  text: string,
  maxLength: number,
  strategy: "truncate-history" | "truncate-context"
): string {
  if (text.length <= maxLength) return text;

  if (strategy === "truncate-history") {
    const lines = text.split("\n").filter(Boolean);
    // Keep the newest lines that fit
    let acc = [];
    let len = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      const candidate = lines[i];
      const extra = (acc.length ? 1 : 0) + candidate.length; // + newline
      if (len + extra > maxLength) break;
      acc.push(candidate);
      len += extra;
    }
    const out = acc.reverse().join("\n");
    return out.length ? out : "(Truncated to empty history)";
  }

  if (strategy === "truncate-context") {
    const priorityRegex = /(Section|Clause|Article)\s+\d+(\.\d+)*/i;
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean).reverse();
    let pieces: string[] = [];
    let total = 0;
    for (const s of sentences) {
      const add = (pieces.length ? 1 : 0) + s.length; // + space
      if (add + total > maxLength) continue;
      // Prefer sentences with legal markers but still enforce hard cap
      if (priorityRegex.test(s) || add + total <= maxLength) {
        pieces.push(s);
        total += add;
      }
    }
    const result = pieces.reverse().join(" ");
    return result.length ? result + " ...[truncated]" : "...[truncated]";
  }

  return text;
}

/**
 * Sanitize input to prevent prompt injection and preserve readability.
 */
function sanitize(input: string): string {
  return input
    .replace(/[\r\t]+/g, " ")
    .replace(/\n+/g, "\n")
    .replace(/(\bignore previous instructions\b)/gi, "") // Prevent prompt injection
    .trim();
}

/**
 * Builds a structured, production-ready system prompt for the AI legal assistant.
 *
 * The assistant must:
 * - Use only the provided context and chat history for answers.
 * - Respond "I don't know" if the answer is not in the context.
 * - Quote laws, sections, or clauses verbatim if referenced.
 * - Provide concise, professional, and legally correct answers.
 * - Summarize multiple valid answers clearly if applicable.
 * - Never fabricate or speculate on laws or clauses.
 *
 * @param context - Legal source material (laws, clauses, facts) for reference.
 * @param question - The user's legal question.
 * @param historyStr - Serialized chat history for continuity.
 * @param config - Optional configuration for prompt customization.
 * @returns A well-structured prompt string for the LLM.
 * @throws Error if inputs are invalid or malformed.
 * @example
 * const prompt = await mainPrompt(
 *   'Section 12.1: Contracts must be signed.',
 *   'Is a contract valid without a signature?',
 *   'User asked about contracts.',
 *   { tone: 'neutral', language: 'en' }
 * );
 */
export async function mainPrompt(
  context: string = "(No context provided)",
  question: string,
  historyStr: string = "(No prior chat history)",
  config: PromptConfig = {}
): Promise<string> {
  try {
    await rateLimiter.consume("main-prompt");
  } catch (err) {
    throw new Error("Rate limit exceeded. Please try again later.");
  }

  if (!question || typeof question !== "string") {
    throw new Error("Question must be a non-empty string");
  }
  if (typeof context !== "string" || typeof historyStr !== "string") {
    throw new Error("Context and history must be strings");
  }

  const sanitizedContext = sanitize(context);
  const sanitizedQuestion = sanitize(question);
  const sanitizedHistory = sanitize(historyStr);

  const defaultConfig: PromptConfig = {
    version: "1.0.0",
    maxLength: 10000,
    tone: "formal",
    temperature: 0,
    truncateStrategy: "truncate-history",
    language: "en",
    logStats: true,
    truncateBuffer: 1000,
  };
  const finalConfig = { ...defaultConfig, ...config };

  const supportedLanguages = ["en"];
  if (!supportedLanguages.includes(finalConfig.language!)) {
    throw new Error(`Unsupported language: ${finalConfig.language}`);
  }

  let prompt = `
=== SYSTEM INSTRUCTION ===
Version: ${finalConfig.version}
Role: You are an AI Legal Assistant. Answer legal questions strictly based on the provided CONTEXT and CHAT HISTORY.
Constraints:
- Do NOT use external knowledge or make assumptions.
- Respond with "I don't know" if the answer is not explicitly in the context.
- Never fabricate or speculate on laws or clauses.
- Quote laws, sections, or clauses verbatim when referenced.
- Keep answers concise, accurate, and legally correct.
- Use a ${finalConfig.tone} tone.
- If multiple valid answers exist, summarize all options clearly and neutrally.
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

  prompt +=
    prompt.length > finalConfig.maxLength!
      ? "- WARNING: Input truncated due to length limits."
      : "";

  if (prompt.length > finalConfig.maxLength!) {
    if (finalConfig.truncateStrategy === "error") {
      throw new Error(
        `Prompt exceeds maximum length of ${finalConfig.maxLength} characters`
      );
    }
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
    }
  }

  if (finalConfig.version === "2.0.0") {
    prompt = prompt.replace(
      "Temperature: ",
      "Advanced Constraint: Ensure responses are limited to 500 words.\nTemperature: "
    );
  }

  if (finalConfig.logStats) {
    logger.debug("Main Prompt Stats", {
      version: finalConfig.version,
      length: prompt.length,
      tokens: estimateTokens(prompt),
      tone: finalConfig.tone,
      language: finalConfig.language,
      questionLength: sanitizedQuestion.length,
    });
  }

  return prompt;
}

/**
 * Generates a prompt for summarizing low-relevance text snippets into concise context for the Q&A system.
 *
 * @param lowRelevance - Array of text blocks to be summarized.
 * @param config - Optional configuration for prompt customization.
 * @returns A prompt string instructing the model to produce a concise summary.
 * @throws Error if inputs are invalid or malformed.
 * @example
 * const prompt = await lowPrompt(
 *   ['Section 12.1: Contracts must be signed.', 'Drafted in 2020.'],
 *   { tone: 'neutral' }
 * );
 */
export async function lowPrompt(
  lowRelevance: string[] = [],
  config: PromptConfig = {}
): Promise<string> {
  try {
    await rateLimiter.consume("low-prompt");
  } catch (err) {
    throw new Error("Rate limit exceeded. Please try again later.");
  }

  if (
    !Array.isArray(lowRelevance) ||
    lowRelevance.some((item) => typeof item !== "string")
  ) {
    throw new Error("lowRelevance must be an array of strings");
  }

  const sanitizedLowRelevance = lowRelevance
    .map(sanitize)
    .filter((item) => item.length > 0);

  const defaultConfig: PromptConfig = {
    version: "1.0.0",
    maxLength: 5000,
    tone: "formal",
    temperature: 0,
    truncateStrategy: "truncate-context",
    language: "en",
    logStats: true,
    truncateBuffer: 500,
  };
  const finalConfig = { ...defaultConfig, ...config };

  const supportedLanguages = ["en"];
  if (!supportedLanguages.includes(finalConfig.language!)) {
    throw new Error(`Unsupported language: ${finalConfig.language}`);
  }

  const content =
    sanitizedLowRelevance.length > 0
      ? sanitizedLowRelevance.join("\n\n")
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
- Respond in ${finalConfig.language}.
- Temperature: ${finalConfig.temperature}.

=== CONTENT TO SUMMARIZE ===
${content}

=== SUMMARY ===
`.trim();

  prompt +=
    prompt.length > finalConfig.maxLength!
      ? "- WARNING: Input truncated due to length limits."
      : "";

  if (prompt.length > finalConfig.maxLength!) {
    if (finalConfig.truncateStrategy === "error") {
      throw new Error(
        `Prompt exceeds maximum length of ${finalConfig.maxLength} characters`
      );
    }
    prompt = truncateText(
      prompt,
      finalConfig.maxLength! - finalConfig.truncateBuffer!,
      "truncate-context"
    );
  }

  if (finalConfig.version === "2.0.0") {
    prompt = prompt.replace(
      "Temperature: ",
      "Advanced Constraint: Summaries must be under 200 words.\nTemperature: "
    );
  }

  if (finalConfig.logStats) {
    logger.debug("Low Prompt Stats", {
      version: finalConfig.version,
      length: prompt.length,
      tokens: estimateTokens(prompt),
      tone: finalConfig.tone,
      language: finalConfig.language,
      inputCount: sanitizedLowRelevance.length,
    });
  }

  return prompt;
}
