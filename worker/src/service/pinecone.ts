import { Pinecone, PineconeRecord } from "@pinecone-database/pinecone";
import { Vector } from "../types/job";

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
  assistantRegion: process.env.PINECONE_REGION,
});

export async function upsertVectors(vectors: Vector[]) {
  const indexName = process.env.PINECONE_INDEX_NAME;

  if (!indexName) {
    throw new Error("Pinecone index name is not set in environment variables.");
  }

  const index = pinecone.index(indexName);

  const records: PineconeRecord[] = vectors.map((vector) => ({
    id: vector.id,
    values: vector.values,
    metadata: vector.metadata,
  }));

  await index.upsert(records);
}
