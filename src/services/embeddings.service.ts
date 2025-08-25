import { InferenceClient } from "@huggingface/inference";

export function chunkText(
  text: string,
  chunkSize: number = Number(process.env.CHUNK_SIZE) || 500,
  overlap: number = Number(process.env.CHUNK_OVERLAP) || 50
): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize));
    start += chunkSize - overlap;
  }
  return chunks;
}

export async function embeddingHF(text: string): Promise<number[]> {
  const inference = new InferenceClient(process.env.HUGGINGFACE_HUB_TOKEN);
  const response = await inference.featureExtraction({
    model: "sentence-transformers/all-mpnet-base-v2",
    inputs: text,
  });

  console.log("Embedding from Huggingface:", response);
  if (!response || Array.isArray(response) === false || response.length === 0) {
    throw new Error("Huggingface API returned empty embeddings");
  }

  if (response.length < 768) {
    console.error(
      "Incomplete embeddings:",
      response.length,
      "received, expected 768"
    );
    throw new Error("Huggingface API returned incomplete embeddings");
  }
  return response as number[];
}
