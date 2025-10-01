import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
// import { v4 as uuid } from 'uuid'; // Unused import
import { EnrichmentService } from '../services/enrichment.service';

// This helper function is not used in the final version of the test file
// as fetch is not mocked directly, but it's good practice to keep it.
function _makeFetchResponse({
  ok = true,
  status = 200,
  statusText = 'OK',
  headers = {},
  body = '',
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

let svc: any;
let mockLLM: any;
let mockVector: any;
let mockSearchAdapter: any;
let mockFetchHTML: any;
let mockDeepResearch: any;

beforeAll(() => {
  // No dynamic import needed, as EnrichmentService is a named export
  // and is already imported at the top of the file.
});

describe('EnrichmentService', () => {
  beforeEach(() => {
    // Mock LLMService with getEmbedding and generateText spy
    mockLLM = {
      getEmbedding: vi.fn(async (text: string) => {
        // Return a deterministic embedding
        return Array.from(
          { length: 8 },
          (_, i) => (text.length % 10) + i + 0.1,
        );
      }),
      generateText: vi.fn(async (prompt: string) => {
        return 'Optimized query for: ' + prompt;
      }),
    };

    // Mock VectorStoreService with upsertVectors spy
    mockVector = {
      upsertVectors: vi.fn(async (vectors: any[]) => {
        return { upserted: vectors.length };
      }),
    };

    // Mock FetchHTML service
    mockFetchHTML = {
      fetchHTML: vi.fn(async (results: unknown[], _options?: unknown) => {
        const paragraph = 'Legal text content '.repeat(20);
        return results.map(() => paragraph);
      }),
    };

    // Mock DeepResearch service
    mockDeepResearch = {
      summarize: vi.fn(async (text: string) => {
        return 'Mock summary of: ' + text.substring(0, 50) + '...';
      }),
    };

    // Default search adapter that returns nothing (tests override)
    mockSearchAdapter = {
      search: vi.fn(async (_q: string, _maxResults?: number) => []),
    };

    // Correctly instantiate the service with all required mocks
    svc = new EnrichmentService(
      mockLLM,
      mockVector,
      mockFetchHTML,
      mockDeepResearch,
      mockSearchAdapter,
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  it('preEmbedDocument embeds document chunks and upserts to vector store', async () => {
    const shortDoc = 'This is a test document. Short text only.';
    const opts = { chunkSize: 1000, chunkOverlap: 0, fileId: 'file-1' };

    await svc.preEmbedDocument(shortDoc, opts);

    expect(mockLLM.getEmbedding).toHaveBeenCalled();
    expect(mockVector.upsertVectors).toHaveBeenCalled();
    const lastCallArgs = mockVector.upsertVectors.mock.calls.slice(-1)[0][0];
    expect(Array.isArray(lastCallArgs)).toBe(true);
    const v = lastCallArgs[0];
    expect(v.metadata.source).toBe('uploaded-doc');
    expect(v.metadata.fileId).toBe(opts.fileId);
    expect(typeof v.values[0]).toBe('number');
  });

  it('searchAndEmbed fetches pages, summarizes, and upserts embeddings', async () => {
    mockSearchAdapter.search = vi.fn(async (_q: string, _n?: number) => [
      {
        title: 'Title A',
        snippet: 'Snippet A',
        url: 'https://example.com/pageA',
      },
    ]);

    await svc.searchAndEmbed('query x', {
      maxResults: 1,
      maxPagesToFetch: 1,
    });

    expect(mockSearchAdapter.search).toHaveBeenCalled();
    expect(mockFetchHTML.fetchHTML).toHaveBeenCalled();
    expect(mockDeepResearch.summarize).toHaveBeenCalled();
    expect(mockLLM.getEmbedding).toHaveBeenCalled();
    expect(mockVector.upsertVectors).toHaveBeenCalled();

    // Verify metadata of upserted vectors
    const upsertArgs = mockVector.upsertVectors.mock.calls[0][0][0].metadata;
    expect(upsertArgs.source).toBe('https://example.com/pageA');
    expect(upsertArgs.title).toBe('Title A');
    expect(upsertArgs.snippet).toBe('Snippet A');
    expect(upsertArgs.deepSummary).toContain('Mock summary of:');
  });

  it('searchAndEmbed skips results for which no content is fetched', async () => {
    mockSearchAdapter.search = vi.fn(async () => [
      {
        title: 'Local',
        snippet: 'Local snippet',
        url: 'http://localhost/internal',
      },
    ]);

    // Mock fetchHTML to return empty array, simulating a failed fetch (e.g., SSRF protection)
    mockFetchHTML.fetchHTML = vi.fn(async () => []);

    const results = await svc.searchAndEmbed('anything', {
      maxResults: 1,
      maxPagesToFetch: 1,
    });

    expect(mockFetchHTML.fetchHTML).toHaveBeenCalled();
    expect(mockDeepResearch.summarize).not.toHaveBeenCalled();
    expect(mockLLM.getEmbedding).not.toHaveBeenCalled();
    expect(mockVector.upsertVectors).not.toHaveBeenCalled();
    // searchAndEmbed returns the original search result entry even when fetching/embedding is skipped, so results.length is expected to remain 1
    expect(results.length).toBe(1);
  });

  it('searchAndEmbed skips processing if fetched content is too short', async () => {
    mockSearchAdapter.search = vi.fn(async () => [
      {
        title: 'Short',
        snippet: 'Short snippet',
        url: 'https://example.com/short',
      },
    ]);

    // Mock fetchHTML to return short content (less than the threshold of 50 characters)
    mockFetchHTML.fetchHTML = vi.fn(async () => ['Short']);

    await svc.searchAndEmbed('q', { maxResults: 1, maxPagesToFetch: 1 });

    expect(mockFetchHTML.fetchHTML).toHaveBeenCalled();
    expect(mockDeepResearch.summarize).not.toHaveBeenCalled();
    expect(mockLLM.getEmbedding).not.toHaveBeenCalled();
    expect(mockVector.upsertVectors).not.toHaveBeenCalled();
  });

  it('enrichIfUnknown calls searchAndEmbed when answer contains "I don\'t know"', async () => {
    const spy = vi.spyOn(svc, 'searchAndEmbed').mockResolvedValue([]);
    const res = await svc.enrichIfUnknown('Q?', "I don't know");
    expect(spy).toHaveBeenCalledWith('Q?', expect.any(Object));
    expect(res).toEqual([]);
    spy.mockRestore();
  });

  it('enrichIfUnknown does not call searchAndEmbed when answer is known', async () => {
    const spy = vi.spyOn(svc, 'searchAndEmbed');
    const res = await svc.enrichIfUnknown(
      'Q?',
      'The capital of France is Paris.',
    );
    expect(spy).not.toHaveBeenCalled();
    expect(res).toBeNull();
  });

  it('preEmbedDocument correctly chunks and embeds long documents', async () => {
    const longDoc = 'a'.repeat(3000);
    const opts = { chunkSize: 1000, chunkOverlap: 100, fileId: 'file-2' };

    await svc.preEmbedDocument(longDoc, opts);

    expect(mockVector.upsertVectors).toHaveBeenCalledTimes(4);
    expect(mockLLM.getEmbedding).toHaveBeenCalledTimes(4);
  });
});
