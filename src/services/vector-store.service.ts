import { Vector, VectorStoreType } from "../types";
import { LLMService } from "./llm.service";
import { PineconeVectorStore } from "./pinecone.service";
import { IVectorStore } from "../interfaces/vector-store.interface";
import { PostgresService } from "./postgres.service";
import { PromptService } from "./prompt.service";
import { LowContentSchema } from "../schemas/low-content.schema";
import { EnrichmentService } from "./enrichment.service";

export class VectorStoreService {
  private vectorStore: IVectorStore;
  private maxContextTokens: number;
  private llm: LLMService;
  private promptSevice: PromptService;

  constructor(llm: LLMService, store: VectorStoreType = "pinecone") {
    this.llm = llm;
    this.maxContextTokens = Number(process.env.MAX_CONTEXT_TOKENS) || 2000;
    this.promptSevice = new PromptService();
    if (store === "pinecone") {
      this.vectorStore = new PineconeVectorStore();
    } else {
      this.vectorStore = PostgresService.getInstance();
    }

    this.llm.enrichmentService = new EnrichmentService(this.llm, this);
  }

  async upsertVectors(vectors: Vector[]) {
    return await this.vectorStore.upsertVectors(vectors);
  }

  async query(
    embedding: number[],
    userId: string,
    fileId: string,
    topK: number = Number(process.env.PINECONE_TOP_K) || 5
  ) {
    return await this.vectorStore.queryVector(embedding, userId, fileId, topK);
  }

  async getContextWithSummarization(results: {
    matches: any[];
  }): Promise<string> {
    const { highRelevance, lowRelevance } =
      this.splitChunksByRelevance(results);
    const summarizedLow = await this.summarizeLowRelevanceChunks(lowRelevance);

    const contextChunks = [...highRelevance, summarizedLow].filter(Boolean);
    let context = "";
    let tokenCount = 0;

    for (const chunk of contextChunks) {
      const estimatedTokens = Math.ceil(chunk.length / 4);
      if (tokenCount + estimatedTokens > this.maxContextTokens) break;
      context += chunk + "\n\n";
      tokenCount += estimatedTokens;
    }

    return context.trim();
  }

  private splitChunksByRelevance(results: { matches: any[] }) {
    const highRelevance: string[] = [];
    const lowRelevance: string[] = [];
    const topK = Number(process.env.PINECONE_TOP_K) || 5;

    results.matches.forEach((match, idx) => {
      const text = Array.isArray(match.metadata?.text)
        ? match.metadata.text.join(" ")
        : String(match.metadata?.text ?? "");
      if (idx < topK) highRelevance.push(text);
      else lowRelevance.push(text);
    });

    return { highRelevance, lowRelevance };
  }

  private async summarizeLowRelevanceChunks(
    lowRelevance: string[]
  ): Promise<string> {
    if (!lowRelevance.length) return "";

    let summary = "";
    const lowPromptInput = {
      question: "",
      context: this.promptSevice.lowPrompt(
        LowContentSchema.parse(lowRelevance)
      ),
      chatHistory: [],
    };

    for await (const token of this.llm.generateAnswerStream(lowPromptInput)) {
      summary += token;
    }

    return summary;
  }
}
