import {
  IVectorStore,
  VectorQueryResult,
  QueryMatch,
} from '../../../shared/interfaces/vector-store.interface';
import { Vector } from '../../../shared/types';
import { pinecone } from '../repos/pinecone.repo';

export class PineconeVectorStore implements IVectorStore {
  private indexName: string;

  constructor(indexName: string | undefined = process.env.PINECONE_INDEX_NAME) {
    if (!indexName) throw new Error('index not set');
    this.indexName = indexName;
  }

  async upsertVectors(vectors: Vector[]) {
    if (!vectors.length) return { upsertedCount: 0, failedBatches: [] };
    const index = pinecone.index(this.indexName);

    const batchSize = 100;
    let total = 0;
    const failedBatches: Array<{ ids: string[]; error: string }> = [];

    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize).map((v) => ({
        id: v.id,
        values: v.values,
        metadata: v.metadata,
      }));

      const batchIds = batch.map((v) => v.id);
      let success = false;
      let lastError: Error | null = null;

      // Retry loop with exponential backoff
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await index.upsert(batch);
          total += batch.length;
          success = true;
          break;
        } catch (error) {
          lastError = error as Error;

          // If this is the last attempt, don't wait
          if (attempt < 3) {
            const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      // If all retries failed, record the failure
      if (!success && lastError) {
        failedBatches.push({
          ids: batchIds,
          error: lastError.message,
        });
      }
    }

    return { upsertedCount: total, failedBatches };
  }

  async queryVector(
    embedding: number[],
    userId: string,
    fileId: string,
    topK = 5,
  ): Promise<VectorQueryResult> {
    const index = pinecone.index(this.indexName);
    const result = await index.query({
      vector: embedding,
      topK,
      includeMetadata: true,
      includeValues: true,
      filter: { userId, fileId },
    });

    // Transform Pinecone result to our standardized format
    const matches: QueryMatch[] =
      result.matches?.map((match: any) => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata || {},
        embedding: match.values ? Array.from(match.values) : undefined,
      })) || [];

    return { matches };
  }
}
