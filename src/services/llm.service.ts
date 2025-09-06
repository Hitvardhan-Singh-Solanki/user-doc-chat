import { InferenceClient } from "@huggingface/inference";
import { mainPrompt } from "../utils/prompt";

export class LLMService {
  private hfToken: string;
  private hfChatModel: string;
  private hfEmbeddingModel: string;
  private pythonUrl?: string;

  constructor() {
    this.hfToken = process.env.HUGGINGFACE_HUB_TOKEN!;
    this.hfChatModel = process.env.HUGGINGFACE_CHAT_MODEL!;
    this.pythonUrl = process.env.PYTHON_LLM_URL;
    this.hfEmbeddingModel = process.env.HUGGINGFACE_EMBEDDING_MODEL!;
  }

  chunkText(
    text: string,
    chunkSize: number = Number(process.env.CHUNK_SIZE) || 500,
    overlap: number = Number(process.env.CHUNK_OVERLAP) || 50
  ): string[] {
    const chunks: string[] = [];
    const size =
      Number.isFinite(chunkSize) && chunkSize > 0 ? Math.floor(chunkSize) : 500;
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
    if (!this.pythonUrl) {
      throw new Error("PYTHON_LLM_URL environment variable is not set");
    }

    const res = await fetch(this.pythonUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Python embed API request failed: ${res.status} ${res.statusText} - ${errText}`
      );
    }

    const data = await res.json();

    if (!data || !data.embedding || !Array.isArray(data.embedding)) {
      throw new Error("Python API returned empty or invalid embeddings");
    }

    return data.embedding;
  }

  async embeddingHF(text: string): Promise<number[]> {
    if (!this.hfToken || !this.hfEmbeddingModel) {
      throw new Error("HuggingFace token or embedding model is missing in env");
    }

    const inference = new InferenceClient(this.hfToken);

    const response = await inference.featureExtraction({
      model: this.hfEmbeddingModel,
      inputs: text,
    });

    if (!Array.isArray(response)) {
      throw new Error("HuggingFace API returned invalid embeddings");
    }

    if (response.length > 0 && typeof response[0] === "number") {
      return response as number[];
    }
    if (Array.isArray(response[0])) {
      const first = response[0] as unknown[];
      if (!first.every((n) => typeof n === "number")) {
        throw new Error("HuggingFace embeddings contain non-numeric values");
      }
      return response[0] as number[];
    }

    throw new Error("Unexpected HuggingFace embeddings shape");
  }

  async *generateAnswerStream(prompt: string) {
    if (!this.hfToken) {
      throw new Error("HuggingFace token is missing in env");
    }

    const inference = new InferenceClient(this.hfToken);

    const stream = await inference.chatCompletionStream({
      model: this.hfChatModel,
      messages: [{ role: "user", content: prompt }],
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }

  buildPrompt(
    context: string,
    question: string,
    chatHistory: string[]
  ): string {
    const historyStr = this.trimChatHistory(chatHistory);

    return mainPrompt(context, question, historyStr);
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
