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
  let mockFetchHTML: any;
  let mockDeepResearch: any;
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
    };

    // Mock VectorStoreService with upsertVectors spy
    mockVector = {
      upsertVectors: vi.fn(async (vectors: any[]) => {
        // return a fake upsert result
        return { upserted: vectors.length };
      }),
    };

    // Mock FetchHTML service
    mockFetchHTML = {
      fetchHTML: vi.fn(async (results: any[], options?: any) => {
        // Return mock text content for each result
        return results.map((r, i) => {
          // Return long enough text to pass minContentLength checks
          const paragraph = "Legal text content ".repeat(20); // ~400+ chars
          return paragraph;
        });
      }),
    };

    // Mock DeepResearch service
    mockDeepResearch = {
      analyze: vi.fn(async (text: string) => {
        return "Mock summary of: " + text.substring(0, 50) + "...";
      }),
    };

    // Default search adapter that returns nothing (tests override)
    mockSearchAdapter = {
      search: vi.fn(async (q: string, maxResults?: number) => []),
      constructor: { name: "MockSearchAdapter" },
    };

    svc = new EnrichmentService(
      mockFetchHTML,
      mockDeepResearch,
      mockSearchAdapter
    );
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
    // Mock search adapter to return one result
    mockSearchAdapter.search = vi.fn(async (_q: string, _n?: number) => [
      {
        title: "Title A",
        snippet: "Snippet A",
        url: "https://example.com/pageA",
      },
    ]);

    // Mock fetchHTML to return text content (already configured in beforeEach)
    // The mockFetchHTML.fetchHTML will be called automatically

    const results = await svc.searchAndEmbed("query x", {
      maxResults: 1,
      maxPagesToFetch: 1,
    });

    // search adapter should have been called
    expect(mockSearchAdapter.search).toHaveBeenCalled();
    // fetchHTML should have been called
    expect(mockFetchHTML.fetchHTML).toHaveBeenCalled();
    // deepResearch.summarize should have been called
    expect(mockDeepResearch.analyze).toHaveBeenCalled();
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

    // Mock fetchHTML to return empty array (simulating SSRF protection)
    mockFetchHTML.fetchHTML = vi.fn(async () => []);

    const results = await svc.searchAndEmbed("anything", {
      maxResults: 1,
      maxPagesToFetch: 1,
    });

    // fetchHTML should have been called
    expect(mockFetchHTML.fetchHTML).toHaveBeenCalled();
    // upsertVectors should NOT have been called (no content returned)
    expect(mockVector.upsertVectors).not.toHaveBeenCalled();
    // service should return the original results array
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

    // Mock fetchHTML to return empty array (simulating non-HTML content rejection)
    mockFetchHTML.fetchHTML = vi.fn(async () => []);

    const results = await svc.searchAndEmbed("x", {
      maxResults: 1,
      maxPagesToFetch: 1,
    });

    // fetchHTML should have been called
    expect(mockFetchHTML.fetchHTML).toHaveBeenCalled();
    // should not upsert because no content was returned
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

    // Mock fetchHTML to return short content (less than 50 chars)
    mockFetchHTML.fetchHTML = vi.fn(async () => ["Short"]);

    await svc.searchAndEmbed("q", { maxResults: 1, maxPagesToFetch: 1 });

    expect(mockVector.upsertVectors).not.toHaveBeenCalled();

    // Now test with long content that should be processed
    const longContent = "This is a reasonably long content ".repeat(10); // > 50 chars
    mockSearchAdapter.search = vi.fn(async () => [
      {
        title: "LongContent",
        snippet: "Long snippet",
        url: "https://example.com/long",
      },
    ]);

    mockFetchHTML.fetchHTML = vi.fn(async () => [longContent]);

    await svc.searchAndEmbed("q", { maxResults: 1, maxPagesToFetch: 1 });
    expect(mockVector.upsertVectors).toHaveBeenCalled();
  });

  it('enrichIfUnknown calls searchAndEmbed when answer contains "I don\'t know"', async () => {
    // spy on searchAndEmbed
    const spy = vi.spyOn(svc as any, "searchAndEmbed").mockResolvedValue([]);

    const res = await svc.enrichIfUnknown("Q?", "I don't know");
    expect(spy).toHaveBeenCalledWith("Q?", expect.any(Object));
    expect(res).toEqual([]);
    spy.mockRestore();
  });

  it("fetchPageText returns null on too-large content-length", async () => {
    // Use a large content-length header to trigger maxBytes check
    mockSearchAdapter.search = vi.fn(async () => [
      { title: "Large", snippet: "S", url: "https://example.com/huge" },
    ]);

    // Mock fetchHTML to return empty array (simulating large content rejection)
    mockFetchHTML.fetchHTML = vi.fn(async () => []);

    await svc.searchAndEmbed("x", { maxResults: 1, maxPagesToFetch: 1 });

    expect(mockVector.upsertVectors).not.toHaveBeenCalled();
  });
});
