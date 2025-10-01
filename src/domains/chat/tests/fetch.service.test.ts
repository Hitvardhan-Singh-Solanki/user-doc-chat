import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FetchHTMLService } from '../services/fetch.service';
import { SearchResult } from '../../../shared/types';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

// Mock external dependencies
// A simpler p-limit mock that runs tasks immediately
vi.mock('p-limit', () => ({
  default: vi.fn((_concurrency) => {
    return (fn: () => Promise<unknown>) => fn();
  }),
}));

vi.mock('net', () => ({
  default: {
    isIP: (ip: string) => (ip.includes('.') ? 4 : ip.includes(':') ? 6 : 0),
  },
}));

// A more robust mock for dns/promises
vi.mock('dns/promises', () => ({
  lookup: vi.fn(async (hostname: string) => {
    if (hostname.includes('private')) {
      return { address: '192.168.1.1' };
    }
    return { address: '8.8.8.8' };
  }),
}));

// A more robust mock for jsdom and readability
vi.mock('jsdom', () => ({
  JSDOM: vi.fn((html: string, _options: unknown) => ({
    window: {
      document: {
        title: 'Mock Document Title',
        body: {
          innerHTML: html,
          textContent: 'This is some mock article content.',
        },
      },
    },
  })),
}));

vi.mock('@mozilla/readability', () => ({
  Readability: vi.fn((_dom) => ({
    parse: () => {
      // Direct return for successful parsing in the test.
      return {
        title: 'Mock Title',
        content: '<p>Mock Content</p>',
        textContent: 'This is some mock article content.',
        length: 34,
        excerpt: 'Mock Excerpt',
        byline: 'Mock Byline',
        dir: 'ltr',
        siteName: 'Mock Site',
        lang: 'en',
        publishedTime: null,
      };
    },
  })),
}));

// Mock the logger - define everything inline to avoid hoisting issues
vi.mock('../config/logger', () => {
  const mockLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function () {
      // @ts-expect-error ignore this line as this is a test to return the same instance
      return this;
    }),
  };
  return {
    logger: mockLogger,
  };
});

// Helper function to create mock fetch responses
function makeFetchResponse({
  ok = true,
  status = 200,
  statusText = 'OK',
  headers = {},
  body = '',
  chunks = false,
}: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
  chunks?: boolean;
}): Response {
  const text = async () => body;
  const buffer = new TextEncoder().encode(body);
  const reader = {
    read: vi.fn(),
  };

  // Normalize header keys for case-insensitive lookup
  const lowerHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lowerHeaders[k.toLowerCase()] = v;
  }

  if (chunks) {
    const chunkSize = 100;
    let offset = 0;
    reader.read.mockImplementation(async () => {
      if (offset >= buffer.length) {
        return { done: true, value: undefined };
      }
      const chunk = buffer.slice(offset, offset + chunkSize);
      offset += chunkSize;
      return { done: false, value: chunk };
    });
  } else {
    let delivered = false;
    reader.read.mockImplementation(async () => {
      if (delivered) {
        return { done: true, value: undefined };
      }
      delivered = true;
      return { done: false, value: buffer };
    });
  }

  return {
    ok,
    status,
    statusText,
    headers: {
      get: (name: string) => lowerHeaders[name.toLowerCase()] ?? null,
    },
    text,
    body: {
      getReader: () => reader,
    },
  } as unknown as Response;
}

describe('FetchHTMLService', () => {
  let svc: FetchHTMLService;
  let originalFetch: any;

  beforeEach(async () => {
    vi.useFakeTimers();
    svc = new FetchHTMLService();
    originalFetch = global.fetch;

    // Mock global fetch
    global.fetch = vi.fn(async () => makeFetchResponse({}));
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  describe('fetchHTML', () => {
    it('should fetch a limited number of pages based on options', async () => {
      const results: SearchResult[] = [
        { url: 'https://example.com/1', title: 'A', snippet: '...' },
        { url: 'https://example.com/2', title: 'B', snippet: '...' },
        { url: 'https://example.com/3', title: 'C', snippet: '...' },
        { url: 'https://example.com/4', title: 'D', snippet: '...' },
        { url: 'https://example.com/5', title: 'E', snippet: '...' },
        { url: 'https://example.com/6', title: 'F', snippet: '...' },
      ];
      const options = { maxPagesToFetch: 3 };

      // Spy on the private method fetchExtract
      const fetchExtractSpy = vi.spyOn(svc as any, 'fetchExtract');
      fetchExtractSpy.mockResolvedValue('mock content');

      const fetched = await svc.fetchHTML(results, options);

      expect(fetchExtractSpy).toHaveBeenCalledTimes(3);
      expect(fetched.length).toBe(3);
    });

    it('should handle errors from fetchExtract gracefully', async () => {
      const results: SearchResult[] = [
        { url: 'https://example.com/ok', title: 'OK', snippet: '...' },
        { url: 'https://example.com/fail', title: 'FAIL', snippet: '...' },
      ];
      const options = {};

      const fetchExtractSpy = vi.spyOn(svc as any, 'fetchExtract');
      fetchExtractSpy
        .mockResolvedValueOnce('some-content')
        .mockRejectedValueOnce(new Error('Network error'));

      const fetched = await svc.fetchHTML(results, options);
      expect(fetched.length).toBe(2);
      expect(fetched[0]).toBe('some-content');
      expect(fetched[1]).toBeUndefined();
    });

    it('should use default options when not provided', async () => {
      const results: SearchResult[] = [
        { url: 'https://example.com/1', title: 'A', snippet: '...' },
      ];
      const fetchExtractSpy = vi.spyOn(svc as any, 'fetchExtract');
      fetchExtractSpy.mockResolvedValue('mock content');

      await svc.fetchHTML(results, {});

      // Updated expectation to include chunkOverlap
      expect(fetchExtractSpy).toHaveBeenCalledWith(expect.any(Object), {
        maxPagesToFetch: 5,
        fetchConcurrency: 2,
        minContentLength: 2000,
        chunkSize: 1000,
        maxResults: 10,
        chunkOverlap: 100, // Added this missing property
      });
    });

    it('should return an empty array for empty input', async () => {
      const fetchExtractSpy = vi.spyOn(svc as any, 'fetchExtract');
      const fetched = await svc.fetchHTML([], {});
      expect(fetched).toEqual([]);
      expect(fetchExtractSpy).not.toHaveBeenCalled();
    });
  });

  describe('fetchExtract', () => {
    const opts = {
      maxPagesToFetch: 5,
      fetchConcurrency: 2,
      minContentLength: 2000,
      chunkSize: 1000,
      maxResults: 10,
      chunkOverlap: 100, // Added this property to match the service
    } as Required<any>;

    beforeEach(() => {
      vi.spyOn(svc as any, 'fetchPageText');
    });

    it('should use page text if it meets minContentLength', async () => {
      const longText = 'a'.repeat(3000);
      (svc as any).fetchPageText.mockResolvedValue(longText);

      const result = await (svc as any).fetchExtract(
        { url: 'https://example.com', snippet: 'short' },
        opts,
      );
      expect(result).toBe(longText);
    });

    it('should use snippet if page text is too short but snippet is long enough', async () => {
      const shortText = 'a'.repeat(100);
      const longSnippet = 'b'.repeat(500);
      (svc as any).fetchPageText.mockResolvedValue(shortText);

      const result = await (svc as any).fetchExtract(
        { url: 'https://example.com', snippet: longSnippet },
        { ...opts, minContentLength: 400 },
      );
      expect(result).toBe(longSnippet);
    });

    it('should return empty string if both page text and snippet are too short', async () => {
      const shortText = 'a'.repeat(100);
      const shortSnippet = 'b'.repeat(30);
      (svc as any).fetchPageText.mockResolvedValue(shortText);

      const result = await (svc as any).fetchExtract(
        { url: 'https://example.com', snippet: shortSnippet },
        opts,
      );
      expect(result).toBe('');
    });
  });

  describe('fetchPageText', () => {
    beforeEach(() => {
      // Mock validateUrlForSSRF and isPublicAddress to simplify testing
      vi.spyOn(svc as any, 'validateUrlForSSRF').mockReturnValue(true);
      vi.spyOn(svc as any, 'isPublicAddress').mockResolvedValue(true);
    });

    it('should return null for non-http/https protocols', async () => {
      (svc as any).validateUrlForSSRF.mockReturnValue(false);
      const result = await (svc as any).fetchPageText('ftp://example.com');
      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return null for localhost and private IP addresses', async () => {
      const urls = [
        'http://localhost',
        'http://127.0.0.1',
        'http://10.0.0.1',
        'http://192.168.1.1',
        'http://172.16.0.1',
      ];
      (svc as any).validateUrlForSSRF.mockReturnValue(false);
      for (const url of urls) {
        const result = await (svc as any).fetchPageText(url);
        expect(result).toBeNull();
      }
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return null if dns lookup resolves to a private IP', async () => {
      (svc as any).isPublicAddress.mockResolvedValue(false);
      const result = await (svc as any).fetchPageText('http://example.com');
      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return null on network error', async () => {
      global.fetch = vi.fn(() => Promise.reject(new Error('Network failed')));
      const result = await (svc as any).fetchPageText('https://example.com');
      expect(result).toBeNull();
    });

    it('should return null on non-ok response status', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve(makeFetchResponse({ ok: false, status: 404 })),
      );
      const result = await (svc as any).fetchPageText('https://example.com');
      expect(result).toBeNull();
    });

    it('should return null on redirect (3xx status)', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve(makeFetchResponse({ status: 301, ok: false })),
      );
      const result = await (svc as any).fetchPageText('https://example.com');
      expect(result).toBeNull();
    });

    it('should return null for non-HTML content-type', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve(
          makeFetchResponse({
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );
      const result = await (svc as any).fetchPageText('https://example.com');
      expect(result).toBeNull();
    });

    it('should return null if content-length is too large', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve(
          makeFetchResponse({
            headers: { 'Content-Length': '3000000' },
          }),
        ),
      );
      const result = await (svc as any).fetchPageText('https://example.com');
      expect(result).toBeNull();
    });

    it('should return null if streamed content exceeds maxBytes', async () => {
      const mockBody = 'a'.repeat(2_000_001);
      global.fetch = vi.fn(() =>
        Promise.resolve(
          makeFetchResponse({
            body: mockBody,
            chunks: true,
          }),
        ),
      );

      const result = await (svc as any).fetchPageText('https://example.com');
      expect(result).toBeNull();
    });

    it('should return null on timeout', async () => {
      global.fetch = vi.fn((_url, init?: any) => {
        return new Promise((_resolve, reject) => {
          // Create and dispatch an AbortError instead of a generic error.
          const abortError = new DOMException(
            'The operation was aborted.',
            'AbortError',
          );
          init?.signal?.addEventListener('abort', () => {
            reject(abortError);
          });
          // To satisfy the type, we must return a promise that resolves to a Response.
          // But in this test, we know it will be aborted and rejected.
        }) as Promise<Response>;
      });

      const promise = (svc as any).fetchPageText('https://example.com', 100);
      await vi.advanceTimersByTimeAsync(100);

      // Assert that the function returns null after the timeout, as expected by the logic in the main file
      const result = await promise;
      expect(result).toBeNull();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should successfully fetch, parse, and return text content', async () => {
      const mockHtml = `
        <html>
          <body>
            <h1>Test Title</h1>
            <p>This is a paragraph with content.</p>
          </body>
        </html>
      `;
      const expectedText = 'This is some mock article content.';
      global.fetch = vi.fn(() =>
        Promise.resolve(
          makeFetchResponse({
            headers: { 'Content-Type': 'text/html' },
            body: mockHtml,
          }),
        ),
      );

      const result = await (svc as any).fetchPageText('https://example.com');
      expect(result).toBe(expectedText);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.any(Object),
      );
      expect(vi.mocked(JSDOM)).toHaveBeenCalledWith(mockHtml, {
        url: 'https://example.com',
      });
      expect(vi.mocked(Readability)).toHaveBeenCalled();
    });
  });

  describe('isPrivateAddress', () => {
    // This part of the test file is correct and doesn't need changes, but it is included for completeness.
    it('should correctly identify private IPv4 addresses', () => {
      const privateAddresses = [
        '10.0.0.1',
        '127.0.0.1',
        '192.168.1.1',
        '172.16.0.1',
        '172.31.255.255',
      ];
      privateAddresses.forEach((ip) => {
        expect((svc as any).isPrivateAddress(ip)).toBe(true);
      });
    });

    it('should correctly identify public IPv4 addresses', () => {
      const publicAddresses = ['8.8.8.8', '203.0.113.5', '1.1.1.1'];
      publicAddresses.forEach((ip) => {
        expect((svc as any).isPrivateAddress(ip)).toBe(false);
      });
    });

    it('should correctly identify private IPv6 addresses', () => {
      const privateAddresses = ['fe80::1', '::1', 'fc00::', 'fdff::1'];
      privateAddresses.forEach((ip) => {
        expect((svc as any).isPrivateAddress(ip)).toBe(true);
      });
    });

    it('should correctly identify public IPv6 addresses', () => {
      const publicAddresses = [
        '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        '2606:4700::1111',
      ];
      publicAddresses.forEach((ip) => {
        expect((svc as any).isPrivateAddress(ip)).toBe(false);
      });
    });
  });
});
