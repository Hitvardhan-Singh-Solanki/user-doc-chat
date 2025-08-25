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

/**
 * @deprecated Use llmService.embedText instead, we are moving away from Ollama
 * @param text
 * @returns Promise<number[]>
 */
export async function embedText(text: string): Promise<number[]> {
  if (!process.env.OLLAMA_URL) {
    throw new Error("OLLAMA_URL environment variable is not set");
  }

  const res = await fetch(`${process.env.OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "nomic-embed-text", input: text }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Ollama embed API request failed: ${res.status} ${res.statusText} - ${errText}`
    );
  }

  const data: {
    model: string;
    embeddings: number[][];
    total_duration: number;
    load_duration: number;
    prompt_eval_count: number;
  } = await res.json();

  if (!data.embeddings || !data.embeddings[0]) {
    throw new Error("Ollama API returned empty embeddings");
  }

  return data.embeddings[0];
}

export async function embeddingPython(text: string): Promise<number[]> {
  console.log("Requesting embedding from Python service");
  if (!process.env.PYTHON_LLM_URL) {
    throw new Error("PYTHON_LLM_URL environment variable is not set");
  }
  const res = await fetch(`${process.env.PYTHON_LLM_URL.trim()}}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Python embed API request failed: ${res.status} ${res.statusText} - ${errText}`
    );
  }

  const data = await res.json();
  console.log("Embedding from Python service:", data);

  return data.embedding;
}
