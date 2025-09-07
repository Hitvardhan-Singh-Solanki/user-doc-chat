import { InferenceClient } from "@huggingface/inference";
import { z } from "zod";
import {
  mainPrompt,
  lowPrompt,
  UserInputSchema,
  LowContentSchema,
  sanitizeText,
} from "../utils/prompt";
import { PromptConfig } from "../types";
import { EnrichmentService } from "./enrichment.service";
import { SearchResult } from "../types";

export class LLMService {
  private hfToken: string;
  private hfChatModel: string;
  private hfEmbeddingModel: string;
  private pythonUrl?: string;
  private enrichmentService!: EnrichmentService;

  constructor() {
    this.hfToken = process.env.HUGGINGFACE_HUB_TOKEN!;
    this.hfChatModel = process.env.HUGGINGFACE_CHAT_MODEL!;
    this.hfEmbeddingModel = process.env.HUGGINGFACE_EMBEDDING_MODEL!;
    this.pythonUrl = process.env.PYTHON_LLM_URL;
  }

  public setEnrichmentService(enr: EnrichmentService) {
    this.enrichmentService = enr;
  }

  chunkText(
    text: string,
    chunkSize: number = Number(process.env.CHUNK_SIZE) || 500,
    overlap: number = Number(process.env.CHUNK_OVERLAP) || 50
  ): string[] {
    const chunks: string[] = [];
    const size = Math.max(1, Math.floor(chunkSize));
    const ov = Math.max(0, overlap);
    const step = Math.max(1, size - ov);
    let start = 0;
    while (start < text.length) {
      chunks.push(text.slice(start, start + size));
      start += step;
    }
    return chunks;
  }

  async embeddingPython(text: string): Promise<number[]> {
    if (!this.pythonUrl)
      throw new Error("PYTHON_LLM_URL environment variable is not set");

    const res = await fetch(this.pythonUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: sanitizeText(text) }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Python embed API request failed: ${res.status} ${res.statusText} - ${errText}`
      );
    }

    const data = await res.json();
    if (!data?.embedding || !Array.isArray(data.embedding))
      throw new Error("Python API returned invalid embeddings");

    return data.embedding;
  }

  async embeddingHF(text: string): Promise<number[]> {
    if (!this.hfToken || !this.hfEmbeddingModel)
      throw new Error("HuggingFace token or embedding model missing");

    const inference = new InferenceClient(this.hfToken);
    const response = await inference.featureExtraction({
      model: this.hfEmbeddingModel,
      inputs: sanitizeText(text),
    });

    if (!Array.isArray(response))
      throw new Error("HuggingFace API returned invalid embeddings");

    if (response.length > 0 && typeof response[0] === "number")
      return response as number[];
    if (
      Array.isArray(response[0]) &&
      (response[0] as any[]).every((n) => typeof n === "number")
    )
      return response[0] as number[];

    throw new Error("Unexpected HuggingFace embeddings shape");
  }

  async *generateAnswerStream(
    userInput: z.infer<typeof UserInputSchema>,
    config?: PromptConfig
  ) {
    if (!this.hfToken) throw new Error("HuggingFace token missing");

    const inference = new InferenceClient(this.hfToken);
    const prompt = mainPrompt(userInput, config);

    const stream = await inference.chatCompletionStream({
      model: this.hfChatModel,
      messages: [{ role: "user", content: prompt }],
    });

    let finalAnswer = "";

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        finalAnswer += content;
        yield content;
      }
    }

    try {
      const enrichmentResults: SearchResult[] | null = this.enrichmentService
        ? await this.enrichmentService.enrichIfUnknown(
            userInput.question,
            finalAnswer
          )
        : null;

      if (enrichmentResults?.length) {
        const enrichedContext = enrichmentResults
          .map((r) => `${r.title}: ${r.snippet}`)
          .join("\n\n");

        const enrichedPrompt = mainPrompt(
          {
            question: userInput.question,
            context: enrichedContext,
            chatHistory: userInput.chatHistory ?? [],
          },
          config
        );

        const enrichedStream = await inference.chatCompletionStream({
          model: this.hfChatModel,
          messages: [{ role: "user", content: enrichedPrompt }],
        });

        for await (const chunk of enrichedStream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) yield content;
        }
      }
    } catch (e) {
      console.warn("Enrichment failed; continuing without it:", e);
    }
  }

  buildPrompt(
    context: string,
    question: string,
    chatHistory: string[],
    config?: PromptConfig
  ): string {
    const sanitizedInput = UserInputSchema.parse({
      context,
      question,
      chatHistory,
    });
    return mainPrompt(sanitizedInput, config);
  }

  buildLowPrompt(lowContent: string[], config?: PromptConfig): string {
    const sanitizedContent = LowContentSchema.parse(lowContent);
    return lowPrompt(sanitizedContent, config);
  }

  private trimChatHistory(chatHistory: string[]): string {
    const MAX_HISTORY_TOKENS = 1000;
    let tokenCount = 0;
    const trimmedHistory: string[] = [];
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const entry = chatHistory[i];
      const entryTokens = Math.ceil(entry.length / 4);
      if (tokenCount + entryTokens > MAX_HISTORY_TOKENS) break;
      trimmedHistory.unshift(entry);
      tokenCount += entryTokens;
    }
    return trimmedHistory.join("\n") + "\n\n";
  }
}
