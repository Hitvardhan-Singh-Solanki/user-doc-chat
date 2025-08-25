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

/**
 * Not working on docker due to network issues, working on local machine
 * the model is quite large so it takes time to load, hence blocking the main thread
 * consider running this in a separate service or using a smaller model
 * @param text string to embed
 * @returns Promise<number[]> calling external Python service for embeddings
 * @throws Error if PYTHON_LLM_URL is not set or if the request fails
 */
export async function embeddingPython(text: string): Promise<number[]> {
  console.log("Requesting embedding from Python service");
  if (!process.env.PYTHON_LLM_URL) {
    throw new Error("PYTHON_LLM_URL environment variable is not set");
  }
  const res = await fetch(`${process.env.PYTHON_LLM_URL}`, {
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

  if (!data || !data.embedding || !Array.isArray(data.embedding)) {
    throw new Error("Python API returned empty or invalid embeddings");
  }

  if (data.embedding.length === 0) {
    throw new Error("Python API returned empty embeddings");
  }

  if (data.embedding.length < 768) {
    console.warn(
      "Warning: Embedding length is less than expected (768):",
      data.embedding.length
    );
    throw new Error("Python API returned embeddings with insufficient length");
  }

  return data.embedding;
}

export async function embeddingHF(text: string): Promise<number[]> {
  const inference = new InferenceClient(process.env.HUGGINGFACE_HUB_TOKEN);
  const response = await inference.featureExtraction({
    model: "sentence-transformers/all-mpnet-base-v2",
    inputs: text,
  });

  if (!response || Array.isArray(response) === false || response.length === 0) {
    throw new Error("Huggingface API returned empty embeddings");
  }

  if (Array.isArray(response[0]) === false) {
    throw new Error("Huggingface API returned invalid embeddings");
  }

  if (response.length < 768) {
    console.warn(
      "Warning: Embedding length is less than expected (768):",
      response[0].length
    );
    throw new Error(
      "Huggingface API returned embeddings with insufficient length"
    );
  }

  return response as number[];
}
