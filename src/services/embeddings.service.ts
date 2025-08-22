export function chunkText(
  text: string,
  chunkSize: number = Number(process.env.CHUNK_SIZE) || 500
): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize));
    start += chunkSize;
  }
  return chunks;
}

export async function embedText(text: string): Promise<number[]> {
  if (!process.env.OLLAMA_URL) {
    throw new Error("OLLAMA_URL environment variable is not set");
  }
  const res = await fetch(`${process.env.OLLAMA_URL}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "nomic-embed-text", input: text }),
  });

  const data = await res.json();
  return data.embedding;
}
