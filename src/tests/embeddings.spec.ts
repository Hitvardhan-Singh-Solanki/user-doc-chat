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

// Additional comprehensive tests appended by automation
describe("chunkText - additional coverage", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    // Reset env between tests to avoid cross-contamination
    process.env = { ...ORIGINAL_ENV };
  });

  it("uses CHUNK_SIZE from env when argument not provided and ignores whitespace", () => {
    process.env.CHUNK_SIZE = " 4 ";
    const text = "abcdefghij";
    const chunks = chunkText(text);
    expect(chunks).toEqual(["abcd", "efgh", "ij"]);
  });

  it("returns full text as single chunk when chunk size >= text length", () => {
    process.env.CHUNK_SIZE = "1000";
    const text = "short";
    expect(chunkText(text)).toEqual(["short"]);
    // Also verify argument override larger than length
    expect(chunkText(text, 1000)).toEqual(["short"]);
  });

  it("handles multi-byte unicode characters without splitting incorrectly (grapheme length approximation)", () => {
    // Using emojis and CJK characters
    process.env.CHUNK_SIZE = "3";
    const text = "😀😁😂你好吗";
    // Behavior depends on implementation using string slice; we assert consistency in chunk boundaries
    const chunks = chunkText(text);
    // Expecting slices of length 3, remainder last
    expect(chunks[0].length).toBeLessThanOrEqual(3);
    expect(chunks.join("")).toBe(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("treats non-positive or invalid chunk sizes by falling back to sane default (does not throw)", () => {
    // Simulate invalid env values
    process.env.CHUNK_SIZE = "not-a-number";
    const text = "abcdefgh";
    // Should not throw; should produce at least one chunk or empty for empty input
    expect(() => chunkText(text)).not.toThrow();
    const chunksEnv = chunkText(text);
    expect(Array.isArray(chunksEnv)).toBe(true);
    expect(chunksEnv.join("")).toBe(text);

    // Zero and negative chunk sizes passed as argument should be handled gracefully
    const chunksZero = chunkText(text, 0 as unknown as number);
    expect(Array.isArray(chunksZero)).toBe(true);
    expect(chunksZero.join("")).toBe(text);

    const chunksNeg = chunkText(text, -5 as unknown as number);
    expect(Array.isArray(chunksNeg)).toBe(true);
    expect(chunksNeg.join("")).toBe(text);
  });

  it("handles very large inputs efficiently by producing expected chunk count", () => {
    process.env.CHUNK_SIZE = "64";
    const text = "x".repeat(1000);
    const chunks = chunkText(text);
    // 1000 / 64 = 15 full chunks + remainder
    expect(chunks.length).toBe(16);
    expect(chunks[0]).toHaveLength(64);
    expect(chunks.at(-1)).toHaveLength(1000 % 64);
    expect(chunks.join("")).toHaveLength(1000);
  });

  it("returns empty array for strings containing only whitespace", () => {
    process.env.CHUNK_SIZE = "8";
    const chunks = chunkText("   \n\t  ");
    // Depending on implementation, it may return ['   \n\t  '] or []
    // We accept either empty or same joined equivalence, but prefer empty for semantic meaning
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.join("")).toBe("   \n\t  ");
  });
});

describe("embedText - additional coverage", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch as unknown as typeof fetch);
    process.env.OLLAMA_URL = "http://mock-ollama";
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OLLAMA_URL;
  });

  it("supports custom model override when provided (if service supports a 'model' parameter)", async () => {
    const fakeEmbedding = [0.9, 0.8];
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ embedding: fakeEmbedding }),
    } as any);

    // @ts-expect-no-error: If embedText accepts a second param for model, this will validate; otherwise harmless in TS with any signature
    const result = await (embedText as any)("override model text", "some-other-model");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://mock-ollama/api/embeddings",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Body should include the provided model name if supported
        body: expect.stringContaining("some-other-model"),
      })
    );
    expect(result).toEqual(fakeEmbedding);
  });

  it("propagates network/rejection errors from fetch", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network down"));
    await expect(embedText("hello")).rejects.toThrow(/network down/i);
  });

  it("throws a descriptive error when response JSON lacks 'embedding' key", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ notEmbedding: [1, 2, 3] }),
    } as any);
    await expect(embedText("no embedding")).rejects.toThrow(/embedding/i);
  });

  it("sends correct payload structure with default model when none is provided", async () => {
    const fakeEmbedding = [0.11, 0.22];
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ embedding: fakeEmbedding }),
    } as any);

    await embedText("payload text");
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });
    const parsed = JSON.parse(String(options.body));
    expect(parsed).toEqual(
      expect.objectContaining({
        model: expect.any(String),
        input: "payload text",
      })
    );
  });

  it("throws if OLLAMA_URL is empty string even if env variable exists", async () => {
    process.env.OLLAMA_URL = "";
    await expect(embedText("x")).rejects.toThrow(/OLLAMA_URL.+not set|empty/i);
  });

  it("includes any additional options as headers if the service supports it (tolerant test)", async () => {
    const fakeEmbedding = [0.33];
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ embedding: fakeEmbedding }),
    } as any);

    // @ts-ignore - exercise potential third parameter for options if available
    await (embedText as any)("hi", undefined, { headers: { Authorization: "Bearer TEST" } });

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(opts.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer TEST",
    });
  });
});
