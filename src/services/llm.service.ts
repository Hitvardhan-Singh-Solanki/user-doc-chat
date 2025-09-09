import { InferenceClient } from "@huggingface/inference";
import { z } from "zod";
import { PromptConfig, SearchResult } from "../types";
import { PromptService } from "./prompt.service";
import { UserInputSchema } from "../schemas/user-input.schema";
import { LowContentSchema } from "../schemas/low-content.schema";
import { IEnrichmentService } from "../interfaces/enrichment.interface";

export class LLMService {
  private hfToken: string;
  private hfChatModel: string;
  private hfSummaryModel: string;
  private hfEmbeddingModel: string;
  private pythonUrl?: string;
  private promptService!: PromptService;

  constructor() {
    this.hfToken = process.env.HUGGINGFACE_HUB_TOKEN!;
    this.hfChatModel = process.env.HUGGINGFACE_CHAT_MODEL!;
    this.hfEmbeddingModel = process.env.HUGGINGFACE_EMBEDDING_MODEL!;
    this.pythonUrl = process.env.PYTHON_LLM_URL;
    this.hfSummaryModel = process.env.HUGGINGFACE_SUMMARY_MODEL!;
    this.promptService = new PromptService();
  }

  private _enrichmentService!: IEnrichmentService;

  set enrichmentService(enr: IEnrichmentService) {
    this._enrichmentService = enr;
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

  async embeddingPython(text: string, timeoutMs = 10_000): Promise<number[]> {
    if (!this.pythonUrl)
      throw new Error("PYTHON_LLM_URL environment variable is not set");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(this.pythonUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ text: this.promptService.sanitizeText(text) }),
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Python embed API request failed: ${res.status} ${res.statusText} - ${errText}`
      );
    }

    const data = await res.json();
    const emb = data?.embedding;
    if (
      !Array.isArray(emb) ||
      !emb.every((n: unknown) => typeof n === "number")
    ) {
      throw new Error("Python API returned invalid embeddings");
    }

    return emb as number[];
  }

  async embeddingHF(text: string): Promise<number[]> {
    if (!this.hfToken || !this.hfEmbeddingModel)
      throw new Error("HuggingFace token or embedding model missing");

    const inference = new InferenceClient(this.hfToken);
    const response = await inference.featureExtraction({
      model: this.hfEmbeddingModel,
      inputs: this.promptService.sanitizeText(text),
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
    const prompt = this.promptService.mainPrompt(userInput, config);

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
      const enrichmentResults: SearchResult[] | null = this._enrichmentService
        ? await this._enrichmentService.enrichIfUnknown(
            userInput.question,
            finalAnswer
          )
        : null;

      if (enrichmentResults?.length) {
        const enrichedContext = enrichmentResults
          .map((r) => `${r.title}: ${r.snippet}`)
          .join("\n\n");

        const enrichedPrompt = this.promptService.mainPrompt(
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

  async generateLowSummary(
    lowContent: string[],
    config?: PromptConfig
  ): Promise<string> {
    if (!this.hfToken) throw new Error("HuggingFace token missing");
    const inference = new InferenceClient(this.hfToken);
    const prompt = this.promptService.lowPrompt(
      LowContentSchema.parse(lowContent),
      config
    );
    const chatCompletionOut = await inference.chatCompletion({
      model: this.hfSummaryModel,
      messages: [{ role: "user", content: prompt }],
    });

    return chatCompletionOut.choices[0]?.message?.content || "";
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
    return this.promptService.mainPrompt(sanitizedInput, config);
  }

  buildLowPrompt(lowContent: string[], config?: PromptConfig): string {
    const sanitizedContent = LowContentSchema.parse(lowContent);
    return this.promptService.lowPrompt(sanitizedContent, config);
  }
}
