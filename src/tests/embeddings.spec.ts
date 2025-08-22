import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chunkText, embedText } from "../services/embeddings.service";

describe("chunkText", () => {
  it("should split text into default chunks", () => {
    process.env.CHUNK_SIZE = "10";
    const text = "abcdefghijklmnopqrstuvwxyz";
    const chunks = chunkText(text);
    expect(chunks).toEqual(["abcdefghij", "klmnopqrst", "uvwxyz"]);
  });

  it("should split text using a custom chunkSize argument", () => {
    const text = "abcdefghij";
    const chunks = chunkText(text, 3);
    expect(chunks).toEqual(["abc", "def", "ghi", "j"]);
  });

  it("should return empty array for empty string", () => {
    const chunks = chunkText("");
    expect(chunks).toEqual([]);
  });
});

describe("embedText", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    process.env.OLLAMA_URL = "http://mock-ollama";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OLLAMA_URL;
  });

  it("should call fetch and return embedding", async () => {
    const fakeEmbedding = [0.1, 0.2, 0.3];
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ embedding: fakeEmbedding }),
    });

    const result = await embedText("test text");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://mock-ollama/api/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "nomic-embed-text", input: "test text" }),
      })
    );
    expect(result).toEqual(fakeEmbedding);
  });

  it("should throw an error if OLLAMA_URL is not set", async () => {
    delete process.env.OLLAMA_URL;
    await expect(embedText("test")).rejects.toThrow(
      "OLLAMA_URL environment variable is not set"
    );
  });
});
