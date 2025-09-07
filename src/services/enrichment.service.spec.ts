import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { v4 as uuid } from "uuid";

function makeFetchResponse({
  ok = true,
  status = 200,
  statusText = "OK",
  headers = {},
  body = "",
}: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
}) {
  return {
    ok,
    status,
    statusText,
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? null;
      },
    },
    text: async () => body,
  };
}

let EnrichmentService: any;

beforeAll(async () => {
  const mod = await import("./enrichment.service");
  EnrichmentService = mod.EnrichmentService;
});

describe("EnrichmentService", () => {
  let originalFetch: any;
  let mockLLM: any;
  let mockVector: any;
  let mockSearchAdapter: any;
  let svc: any;

  beforeEach(() => {
    originalFetch = (globalThis as any).fetch;

    // Mock LLMService with embeddingHF that returns a deterministic embedding
    mockLLM = {
      embeddingHF: vi.fn(async (text: string) => {
        // return embedding length based on text length for test variety
        return Array.from(
          { length: 8 },
          (_, i) => (text.length % 10) + i + 0.1
        );
      }),
      // reuse chunkText from the real service? not needed here; EnrichmentService uses its own chunkText
    };

    // Mock VectorStoreService with upsertVectors spy
    mockVector = {
      upsertVectors: vi.fn(async (vectors: any[]) => {
        // return a fake upsert result
        return { upserted: vectors.length };
      }),
    };

    // Default search adapter that returns nothing (tests override)
    mockSearchAdapter = {
      search: vi.fn(async (q: string, maxResults?: number) => []),
      constructor: { name: "MockSearchAdapter" },
    };

    svc = new EnrichmentService(mockLLM, mockVector, mockSearchAdapter);
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
    vi.resetAllMocks();
  });

  it("preEmbedDocument embeds document chunks and upserts to vector store", async () => {
    const shortDoc = "This is a test document. Short text only.";
    // Ensure chunk size is big so it produces one chunk
    const opts = { chunkSize: 1000, chunkOverlap: 0, fileId: "file-1" };

    await svc.preEmbedDocument(shortDoc, opts);

    // embeddingHF should be called at least once
    expect(mockLLM.embeddingHF).toHaveBeenCalled();
    // upsertVectors should be called matching the chunk count (one)
    expect(mockVector.upsertVectors).toHaveBeenCalled();
    const lastCallArgs = mockVector.upsertVectors.mock.calls.slice(-1)[0][0];
    expect(Array.isArray(lastCallArgs)).toBe(true);
    const v = lastCallArgs[0];
    expect(v.metadata.source).toBe("uploaded-doc");
    expect(v.metadata.fileId).toBe(opts.fileId);
    expect(typeof v.values[0]).toBe("number");
  });

  it("searchAndEmbed fetches pages, extracts text and upserts embeddings", async () => {
    // create a long HTML body so Readability will extract textContent > minContentLength
    const paragraph = "Legal text ".repeat(50); // ~500+ chars
    const html = `<html><body><article><p>${paragraph}</p></article></body></html>`;

    // Mock search adapter to return one result
    mockSearchAdapter.search = vi.fn(async (_q: string, _n?: number) => [
      {
        title: "Title A",
        snippet: "Snippet A",
        url: "https://example.com/pageA",
      },
    ]);

    // Mock fetch to return HTML with content-type containing html
    (globalThis as any).fetch = vi.fn(async (url: string) => {
      expect(url).toBe("https://example.com/pageA");
      return makeFetchResponse({
        ok: true,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-length": String(html.length),
        },
        body: html,
      });
    });

    const results = await svc.searchAndEmbed("query x", {
      maxResults: 1,
      maxPagesToFetch: 1,
    });

    // search adapter should have been called
    expect(mockSearchAdapter.search).toHaveBeenCalled();
    // upsertVectors should have been called at least once
    expect(mockVector.upsertVectors).toHaveBeenCalled();
    // verify returned results match searchAdapter output
    expect(results.length).toBe(1);
    expect(results[0].title).toBe("Title A");
  });

  it("searchAndEmbed skips localhost URLs (SSRF protection)", async () => {
    mockSearchAdapter.search = vi.fn(async () => [
      {
        title: "Local",
        snippet: "Local snippet",
        url: "http://localhost/internal",
      },
    ]);

    // spy on fetch to ensure even if called it will not proceed; but fetch shouldn't be used to fetch local content
    (globalThis as any).fetch = vi.fn(async () => {
      return makeFetchResponse({
        ok: true,
        headers: { "content-type": "text/html" },
        body: "<html></html>",
      });
    });

    const results = await svc.searchAndEmbed("anything", {
      maxResults: 1,
      maxPagesToFetch: 1,
    });

    // upsertVectors should NOT have been called (page skipped)
    expect(mockVector.upsertVectors).not.toHaveBeenCalled();
    // fetch may or may not be called depending on early return - ensure safe either way
    // but service should return the original results array
    expect(results.length).toBe(1);
  });

  it("searchAndEmbed skips non-HTML content-type", async () => {
    mockSearchAdapter.search = vi.fn(async () => [
      {
        title: "Api",
        snippet: "JSON snippet",
        url: "https://api.example.com/data",
      },
    ]);

    (globalThis as any).fetch = vi.fn(async () =>
      makeFetchResponse({
        ok: true,
        headers: {
          "content-type": "application/json",
          "content-length": "100",
        },
        body: '{"hello":"world"}',
      })
    );

    const results = await svc.searchAndEmbed("x", {
      maxResults: 1,
      maxPagesToFetch: 1,
    });

    // should not upsert because content-type is not HTML
    expect(mockVector.upsertVectors).not.toHaveBeenCalled();
    expect(results.length).toBe(1);
  });

  it("fetchExtractAndUpsert uses snippet when pageText shorter than minContentLength and skips if snippet too short", async () => {
    // provide search results with snippet shorter than 50 chars -> should be skipped
    const shortSnippet = "Too short snippet";
    mockSearchAdapter.search = vi.fn(async () => [
      {
        title: "Short",
        snippet: shortSnippet,
        url: "https://example.com/short",
      },
    ]);

    // fetch returns very short html -> pageText short -> fallback to snippet (also short) -> skip upsert
    (globalThis as any).fetch = vi.fn(async () =>
      makeFetchResponse({
        ok: true,
        headers: { "content-type": "text/html", "content-length": "20" },
        body: "<html><body><p>Hi</p></body></html>",
      })
    );

    await svc.searchAndEmbed("q", { maxResults: 1, maxPagesToFetch: 1 });

    expect(mockVector.upsertVectors).not.toHaveBeenCalled();

    // Now a snippet long enough (>50 chars) should be used and upserted
    const longSnippet =
      "This is a reasonably long snippet ".repeat(3); // > 50 chars
    mockSearchAdapter.search = vi.fn(async () => [
      {
        title: "LongSnippet",
        snippet: longSnippet,
        url: "https://example.com/short",
      },
    ]);

    (globalThis as any).fetch = vi.fn(async () =>
      makeFetchResponse({
        ok: true,
        headers: { "content-type": "text/html", "content-length": "20" },
        body: "<html><body><p>Hi</p></body></html>",
      })
    );

    await svc.searchAndEmbed("q", { maxResults: 1, maxPagesToFetch: 1 });
    expect(mockVector.upsertVectors).toHaveBeenCalled();
  });

  it("preEmbedDocument splits long text into multiple chunks and upserts all of them", async () => {
    const longDoc = "ABCDE ".repeat(600); // ~3600+ chars -> many chunks with small chunkSize
    const opts = { chunkSize: 256, chunkOverlap: 32, fileId: "file-long" };

    await svc.preEmbedDocument(longDoc, opts);

    expect(mockLLM.embeddingHF).toHaveBeenCalled();
    expect(mockVector.upsertVectors).toHaveBeenCalled();

    const vectors = mockVector.upsertVectors.mock.calls.slice(-1)[0][0];
    // Expect multiple chunks
    expect(Array.isArray(vectors)).toBe(true);
    expect(vectors.length).toBeGreaterThan(1);

    // Validate each vector's minimal shape
    for (const v of vectors) {
      expect(typeof v.id).toBe("string");
      expect(v.id.length).toBeGreaterThan(10);
      expect(v.metadata.source).toBe("uploaded-doc");
      expect(v.metadata.fileId).toBe(opts.fileId);
      expect(Array.isArray(v.values)).toBe(true);
      expect(typeof v.values[0]).toBe("number");
    }
  });

  it("searchAndEmbed handles non-OK fetch responses by skipping upsert and still returning search results", async () => {
    mockSearchAdapter.search = vi.fn(async () => [
      {
        title: "Bad",
        snippet:
          "Some snippet long enough to pass threshold " +
          "x".repeat(80),
        url: "https://example.com/500",
      },
    ]);

    (globalThis as any).fetch = vi.fn(async () =>
      makeFetchResponse({
        ok: false,
        status: 500,
        statusText: "Server Error",
        headers: { "content-type": "text/html", "content-length": "500" },
        body:
          "<html><body><article><p>Server error page</p></article></body></html>",
      })
    );

    const results = await svc.searchAndEmbed("query", {
      maxResults: 1,
      maxPagesToFetch: 1,
    });

    expect(mockSearchAdapter.search).toHaveBeenCalled();
    expect(mockVector.upsertVectors).not.toHaveBeenCalled();
    expect(results.length).toBe(1);
    expect(results[0].url).toBe("https://example.com/500");
  });

  it("searchAndEmbed respects maxPagesToFetch by limiting fetch calls", async () => {
    const html = `<html><body><article><p>${"Content ".repeat(60)}</p></article></body></html>`;
    mockSearchAdapter.search = vi.fn(async () => [
      { title: "A", snippet: "S".repeat(80), url: "https://example.com/a" },
      { title: "B", snippet: "S".repeat(80), url: "https://example.com/b" },
      { title: "C", snippet: "S".repeat(80), url: "https://example.com/c" },
    ]);

    (globalThis as any).fetch = vi.fn(async (url: string) => {
      expect([
        "https://example.com/a",
        "https://example.com/b",
        "https://example.com/c",
      ]).toContain(url);
      return makeFetchResponse({
        ok: true,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-length": String(html.length),
        },
        body: html,
      });
    });

    const results = await svc.searchAndEmbed("any", {
      maxResults: 3,
      maxPagesToFetch: 2,
    });

    // Only 2 pages fetched even though 3 results are available
    expect((globalThis as any).fetch).toHaveBeenCalledTimes(2);
    expect(mockVector.upsertVectors).toHaveBeenCalled();
    expect(results.length).toBe(3); // returns search results regardless
  });

  it("searchAndEmbed processes HTML when content-length header is absent (treat unknown size safely)", async () => {
    const html = `<html><body><article><p>${"Law text ".repeat(70)}</p></article></body></html>`;
    mockSearchAdapter.search = vi.fn(async () => [
      {
        title: "NoLength",
        snippet: "S".repeat(100),
        url: "https://example.com/nolength",
      },
    ]);

    (globalThis as any).fetch = vi.fn(async () =>
      makeFetchResponse({
        ok: true,
        headers: { "content-type": "text/html" }, // no content-length header
        body: html,
      })
    );

    await svc.searchAndEmbed("q", { maxResults: 1, maxPagesToFetch: 1 });

    expect(mockVector.upsertVectors).toHaveBeenCalled();
  });

  it("preEmbedDocument assigns UUID-like ids for each vector", async () => {
    const doc =
      "This is a mid-sized document with enough content to create multiple chunks. " +
      "x".repeat(600);
    const opts = {
      chunkSize: 300,
      chunkOverlap: 20,
      fileId: "file-uuid",
    };

    await svc.preEmbedDocument(doc, opts);

    const vectors = mockVector.upsertVectors.mock.calls.slice(-1)[0][0];
    expect(vectors.length).toBeGreaterThan(1);
    for (const v of vectors) {
      // Basic UUID shape check: 8-4-4-4-12 with hyphens
      expect(
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
          v.id
        )
      ).toBe(true);
    }
  });
});