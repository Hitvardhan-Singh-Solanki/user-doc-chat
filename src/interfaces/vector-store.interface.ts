import { Vector } from "../types";

export interface IVectorStore {
  upsertVectors(vectors: Vector[]): Promise<{ upsertedCount: number }>;
  queryVector(
    embedding: number[],
    userId: string,
    fileId: string,
    topK?: number
  ): Promise<any>;
}
