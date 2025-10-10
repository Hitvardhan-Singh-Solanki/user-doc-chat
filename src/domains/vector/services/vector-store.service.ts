import { Vector, VectorStoreType } from '../../../shared/types';
import { LLMService } from '../../../domains/chat/services/llm.service';
import { PineconeVectorStore } from './pinecone.service';
import {
  IVectorStore,
  VectorQueryResult,
} from '../../../shared/interfaces/vector-store.interface';
import { PostgresService } from '../../../infrastructure/database/repositories/postgres.repository';
import { config } from '@config';

export class VectorStoreService {
  private vectorStore: IVectorStore;
  private maxContextTokens: number;
  private llm: LLMService;

  constructor(llm: LLMService, store: VectorStoreType = 'pinecone') {
    this.llm = llm;
    this.maxContextTokens = config.MAX_CONTEXT_TOKENS;
    if (store === 'pinecone') {
      this.vectorStore = new PineconeVectorStore();
    } else {
      this.vectorStore = PostgresService.getInstance();
    }
  }

  async upsertVectors(vectors: Vector[]) {
    return await this.vectorStore.upsertVectors(vectors);
  }

  async query(
    embedding: number[],
    userId: string,
    fileId: string,
    topK: number = config.PINECONE_TOP_K,
  ): Promise<VectorQueryResult> {
    return await this.vectorStore.queryVector(embedding, userId, fileId, topK);
  }

  async getContextWithSummarization(
    results: VectorQueryResult,
    topK: number = config.PINECONE_TOP_K,
  ): Promise<string> {
    const { highRelevance, lowRelevance } = this.splitChunksByRelevance(
      results,
      topK,
    );
    const summarizedLow = await this.summarizeLowRelevanceChunks(lowRelevance);

    const contextChunks = [...highRelevance, summarizedLow].filter(Boolean);
    let context = '';
    let tokenCount = 0;

    for (const chunk of contextChunks) {
      const estimatedTokens = Math.ceil(chunk.length / 4);
      if (tokenCount + estimatedTokens > this.maxContextTokens) break;
      context += chunk + '\n\n';
      tokenCount += estimatedTokens;
    }

    return context.trim();
  }

  private splitChunksByRelevance(results: VectorQueryResult, topK: number) {
    const highRelevance: string[] = [];
    const lowRelevance: string[] = [];

    results.matches.forEach((match, idx) => {
      const text = Array.isArray(match.metadata?.text)
        ? match.metadata.text.join(' ')
        : String(match.metadata?.text ?? '');
      if (idx < topK) highRelevance.push(text);
      else lowRelevance.push(text);
    });

    return { highRelevance, lowRelevance };
  }

  private async summarizeLowRelevanceChunks(
    lowRelevance: string[],
  ): Promise<string> {
    if (!lowRelevance.length) return '';

    return this.llm.generateLowSummary(lowRelevance);
  }
}
