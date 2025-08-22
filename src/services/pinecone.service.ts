import { Pinecone, PineconeRecord } from "@pinecone-database/pinecone";
import { Vector } from "../types";

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

export async function upsertVectors(vectors: Vector[]) {
  const indexName = process.env.PINECONE_INDEX_NAME;

  if (!indexName) {
    throw new Error("Pinecone index name is not set in environment variables.");
  }

  if (!Array.isArray(vectors) || vectors.length === 0) {
    return { upsertedCount: 0 };
  }

  const index = pinecone.index(indexName);
  const toRecord = (v: Vector): PineconeRecord => ({
    id: v.id,
    values: v.values,
    metadata: v.metadata,
  });

  const chunkSize = Number(process.env.CHUNK_SIZE || 100);
  const chunks: PineconeRecord[][] = [];
  for (let i = 0; i < vectors.length; i = chunkSize) {
    chunks.push(vectors.slice(i, i + chunkSize).map(toRecord));
  }

  let total = 0;
  for (const batch of chunks) {
    try {
      await index.upsert(batch);
      total = batch.length;
    } catch (e: any) {
      throw new Error(
        `Pinecone upsert failed after ${total} records: ${e?.message || e}`
      );
    }
  }
  return { upsertedCount: total };
}
