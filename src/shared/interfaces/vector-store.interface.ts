import { Vector } from '../types';

export interface QueryMatch {
  id: string;
  score: number;
  metadata: Record<string, any>;
  embedding?: number[];
}

export interface VectorQueryResult {
  matches: QueryMatch[];
}

export interface IVectorStore {
  upsertVectors(vectors: Vector[]): Promise<{ upsertedCount: number }>;
  queryVector(
    embedding: number[],
    userId: string,
    fileId: string,
    topK?: number,
  ): Promise<VectorQueryResult>;
}
