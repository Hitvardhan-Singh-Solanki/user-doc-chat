import { IVectorStore } from '../interfaces/vector-store.interface';
import { Vector } from '../types';
import { pinecone } from '../repos/pinecone.repo';

export class PineconeVectorStore implements IVectorStore {
  private indexName: string;

  constructor(indexName: string | undefined = process.env.PINECONE_INDEX_NAME) {
    if (!indexName) throw new Error('index not set');
    this.indexName = indexName;
  }

  async upsertVectors(vectors: Vector[]) {
    if (!vectors.length) return { upsertedCount: 0 };
    const index = pinecone.index(this.indexName);

    const batchSize = 100;
    let total = 0;

    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize).map((v) => ({
        id: v.id,
        values: v.values,
        metadata: v.metadata,
      }));
      await index.upsert(batch);
      total += batch.length;
    }

    return { upsertedCount: total };
  }

  async queryVector(
    embedding: number[],
    userId: string,
    fileId: string,
    topK = 5,
  ) {
    const index = pinecone.index(this.indexName);
    return index.query({
      vector: embedding,
      topK,
      includeMetadata: true,
      filter: { userId, fileId },
    });
  }
}
