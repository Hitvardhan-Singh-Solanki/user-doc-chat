import {
  PineconeRecord,
  QueryResponse,
  RecordMetadata,
} from "@pinecone-database/pinecone";
import { Vector } from "../types";
import { pinecone } from "../repos/pinecone.repo";
import { LLMService } from "./llm.service";

export class PineconeService {
  private indexName: string;
  private maxContextTokens: number;
  private llm: LLMService;

  constructor() {
    this.indexName = process.env.PINECONE_INDEX_NAME!;
    this.maxContextTokens = Number(process.env.MAX_CONTEXT_TOKENS) || 2000;

    if (!this.indexName) {
      throw new Error("Pinecone index name is not set in env");
    }

    this.llm = new LLMService();
  }

  async upsertVectors(vectors: Vector[]) {
    if (!vectors || vectors.length === 0) return { upsertedCount: 0 };

    const index = pinecone.index(this.indexName);

    const toRecord = (v: Vector): PineconeRecord => ({
      id: v.id,
      values: v.values,
      metadata: v.metadata,
    });

    const rawChunk = Number(process.env.CHUNK_SIZE);
    const chunkSize =
      Number.isFinite(rawChunk) && rawChunk > 0 ? Math.floor(rawChunk) : 100;

    const chunks: PineconeRecord[][] = [];
    for (let i = 0; i < vectors.length; i += chunkSize) {
      chunks.push(vectors.slice(i, i + chunkSize).map(toRecord));
    }

    let total = 0;
    for (const batch of chunks) {
      await index.upsert(batch);
      total += batch.length;
    }

    return { upsertedCount: total };
  }

  async query(
    embedding: number[],
    userId: string,
    fileId: string,
    topK: number = Number(process.env.PINECONE_TOP_K)
  ): Promise<QueryResponse<RecordMetadata>> {
    const index = pinecone.index(this.indexName);

    const queryRequest = {
      vector: embedding,
      topK,
      includeMetadata: true,
      filter: { userId, fileId },
    };

    return await index.query(queryRequest);
  }

  /**
   * Returns high + summarized low relevance chunks combined as a single context string
   */
  async getContextWithSummarization(
    results: QueryResponse<RecordMetadata>
  ): Promise<string> {
    const { highRelevance, lowRelevance } =
      this.splitChunksByRelevance(results);
    const summarizedLow = await this.summarizeLowRelevanceChunks(lowRelevance);

    // Combine high + summarized low
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

  private splitChunksByRelevance(results: QueryResponse<RecordMetadata>) {
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

    const lowPrompt = `
    Summarize the following content concisely for context usage in a Q&A system:
    ${lowRelevance.join("\n\n")}
    `.trim();

    let summary = "";
    for await (const token of this.llm.generateAnswerStream(lowPrompt)) {
      summary += token;
    }

    return summary;
  }
}
