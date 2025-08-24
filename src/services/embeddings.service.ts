/**
 * Splits a string into sequential chunks of a given size with a specified overlap.
 *
 * Produces an array of substrings by taking windows of `chunkSize` characters and advancing
 * the window by `chunkSize - overlap` each iteration until the end of the input is reached.
 *
 * @param text - The input string to split.
 * @param chunkSize - Maximum size (in characters) of each chunk. Defaults to `Number(process.env.CHUNK_SIZE)` or `500`.
 * @param overlap - Number of characters that overlap between consecutive chunks. Defaults to `Number(process.env.CHUNK_OVERLAP)` or `50`.
 * @returns An array of string chunks covering the input; the last chunk may be shorter than `chunkSize`.
 */
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
 * Creates an embedding vector for the given text using the Ollama embed API.
 *
 * @deprecated Use `llmService.embedText` instead; the project is moving away from Ollama.
 *
 * Detailed behavior:
 * - Requires the OLLAMA_URL environment variable to be set; otherwise an Error is thrown.
 * - Sends a POST to `${OLLAMA_URL}/api/embed` with `{ model: "nomic-embed-text", input: text }`.
 * - If the HTTP response is not ok, throws an Error that includes the status, statusText, and response body.
 * - If the response JSON does not contain a non-empty `embeddings` array, throws an Error.
 *
 * @param text - The input text to embed.
 * @returns The first embedding vector returned by the Ollama API.
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
