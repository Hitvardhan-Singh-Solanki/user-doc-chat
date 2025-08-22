import { Pinecone, PineconeRecord } from "@pinecone-database/pinecone";
import { Vector } from "../types/job";

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

export async function upsertVectors(vectors: Vector[], namespace = "default") {
  const index = pinecone.index(namespace);

  const records: PineconeRecord[] = vectors.map((vector) => ({
    id: vector.id,
    values: vector.values,
    metadata: vector.metadata,
  }));

  await index.upsert(records);
}
