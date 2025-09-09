import { describe, it, expect, vi, beforeEach } from "vitest";
import { FetchHTMLService } from "./fetch.service";
import { SearchResult, EnrichmentOptions } from "../types";

// Mock external dependencies
vi.mock("p-limit", () => {
  return {
    default: vi.fn((concurrency) => {
      return (fn: any) => fn();
    }),
  };
});

vi.mock("jsdom", () => ({
  JSDOM: vi.fn().mockImplementation((html, options) => ({
    window: {
      document: {
        // Mock document for Readability
      },
    },
  })),
}));

vi.mock("@mozilla/readability", () => ({
  Readability: vi.fn().mockImplementation((document) => ({
    parse: vi.fn().mockReturnValue({
      textContent: "Extracted text content from the HTML document.",
    }),
  })),
}));

vi.mock("dns/promises", () => ({
  lookup: vi.fn(),
}));

describe.skip("FetchHTMLService", () => {
  let fetchService: FetchHTMLService;
  let mockFetch: any;
  let mockLookup: any;

  beforeEach(() => {
    fetchService = new FetchHTMLService();

    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock DNS lookup
    mockLookup = vi.fn();
    vi.doMock("dns/promises", () => ({
      lookup: mockLookup,
    }));

    // Mock console methods
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});

    // Reset mocks
    vi.clearAllMocks();
  });

  const createMockSearchResults = (count: number = 2): SearchResult[] => {
    return Array.from({ length: count }, (_, i) => ({
      title: `Test Result ${i + 1}`,
      snippet: `This is test snippet ${i + 1}`,
      url: `https://example${i + 1}.com/page`,
    }));
  };

  const createMockOptions = (
    overrides: Partial<EnrichmentOptions> = {}
  ): EnrichmentOptions => ({
    maxPagesToFetch: 5,
    fetchConcurrency: 2,
    minContentLength: 200,
    chunkSize: 800,
    maxResults: 10,
    ...overrides,
  });

  const createMockResponse = (
    body: string = "<html><body><p>Test content</p></body></html>",
    headers: Record<string, string> = {},
    status: number = 200
  ) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] || null,
    },
    body: {
      getReader: () => ({
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(body),
          })
          .mockResolvedValueOnce({
            done: true,
            value: null,
          }),
      }),
    },
    text: vi.fn().mockResolvedValue(body),
  });

  describe("fetchHTML", () => {
    it("should successfully fetch HTML content from multiple URLs", async () => {
      const results = createMockSearchResults(2);
      const options = createMockOptions();

      mockLookup.mockResolvedValue({ address: "1.2.3.4" });
      mockFetch.mockResolvedValue(
        createMockResponse(
          "<html><body><article><p>Long content that meets minimum length requirements.</p></article></body></html>",
          { "content-type": "text/html" }
        )
      );

      const extracted = await fetchService.fetchHTML(results, options);

      expect(extracted).toHaveLength(2);
      expect(extracted[0]).toBe(
        "Extracted text content from the HTML document."
      );
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("should limit fetched pages by maxPagesToFetch", async () => {
      const results = createMockSearchResults(10);
      const options = createMockOptions({ maxPagesToFetch: 3 });

      mockLookup.mockResolvedValue({ address: "1.2.3.4" });
      mockFetch.mockResolvedValue(
        createMockResponse("<html><body><p>Test content</p></body></html>", {
          "content-type": "text/html",
        })
      );

      const extracted = await fetchService.fetchHTML(results, options);

      expect(extracted).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("should return empty array when no results provided", async () => {
      const results: SearchResult[] = [];
      const options = createMockOptions();

      const extracted = await fetchService.fetchHTML(results, options);

      expect(extracted).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should handle fetch failures gracefully", async () => {
      const results = createMockSearchResults(2);
      const options = createMockOptions();

      mockLookup.mockResolvedValue({ address: "1.2.3.4" });
      mockFetch
        .mockResolvedValueOnce(
          createMockResponse("<html><body><p>Success</p></body></html>", {
            "content-type": "text/html",
          })
        )
        .mockRejectedValueOnce(new Error("Network error"));

      const extracted = await fetchService.fetchHTML(results, options);

      expect(extracted).toHaveLength(2);
      expect(extracted[0]).toBe(
        "Extracted text content from the HTML document."
      );
      expect(extracted[1]).toBe("");
    });

    it("should reject localhost URLs for SSRF protection", async () => {
      const results: SearchResult[] = [
        {
          title: "Localhost Test",
          snippet: "Local content",
          url: "http://localhost/test",
        },
      ];
      const options = createMockOptions();

      const extracted = await fetchService.fetchHTML(results, options);

      expect(extracted).toHaveLength(1);
      expect(extracted[0]).toBe("");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should reject private IP addresses", async () => {
      const results: SearchResult[] = [
        {
          title: "Private IP Test",
          snippet: "Private content",
          url: "http://192.168.1.1/test",
        },
      ];
      const options = createMockOptions();

      mockLookup.mockResolvedValue({ address: "192.168.1.1" });

      const extracted = await fetchService.fetchHTML(results, options);

      expect(extracted).toHaveLength(1);
      expect(extracted[0]).toBeUndefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should reject non-HTTP(S) protocols", async () => {
      const results: SearchResult[] = [
        {
          title: "FTP Test",
          snippet: "FTP content",
          url: "ftp://example.com/test",
        },
      ];
      const options = createMockOptions();

      const extracted = await fetchService.fetchHTML(results, options);

      expect(extracted).toHaveLength(1);
      expect(extracted[0]).toBeUndefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should reject non-HTML content types", async () => {
      const results = createMockSearchResults(1);
      const options = createMockOptions();

      mockLookup.mockResolvedValue({ address: "1.2.3.4" });
      mockFetch.mockResolvedValue(
        createMockResponse('{"key": "value"}', {
          "content-type": "application/json",
        })
      );

      const extracted = await fetchService.fetchHTML(results, options);

      expect(extracted).toHaveLength(1);
      expect(extracted[0]).toBeUndefined();
    });

    it("should handle redirects by returning null", async () => {
      const results = createMockSearchResults(1);
      const options = createMockOptions();

      mockLookup.mockResolvedValue({ address: "1.2.3.4" });
      mockFetch.mockResolvedValue({
        ok: false,
        status: 302,
        headers: {
          get: () => null,
        },
      });

      const extracted = await fetchService.fetchHTML(results, options);

      expect(extracted).toHaveLength(1);
      expect(extracted[0]).toBeUndefined();
    });

    it("should reject content exceeding size limits", async () => {
      const results = createMockSearchResults(1);
      const options = createMockOptions();

      mockLookup.mockResolvedValue({ address: "1.2.3.4" });
      mockFetch.mockResolvedValue(
        createMockResponse("<html></html>", {
          "content-type": "text/html",
          "content-length": "3000000", // 3MB
        })
      );

      const extracted = await fetchService.fetchHTML(results, options);

      expect(extracted).toHaveLength(1);
      expect(extracted[0]).toBeUndefined();
    });

    it("should handle DNS lookup failures", async () => {
      const results = createMockSearchResults(1);
      const options = createMockOptions();

      mockLookup.mockRejectedValue(new Error("DNS resolution failed"));

      const extracted = await fetchService.fetchHTML(results, options);

      expect(extracted).toHaveLength(1);
      expect(extracted[0]).toBeUndefined();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should handle empty or null extracted content", async () => {
      const results = createMockSearchResults(1);
      const options = createMockOptions();

      // Mock Readability to return null
      const mockReadability = await vi.importMock("@mozilla/readability");
      (mockReadability as any).Readability.mockImplementation(() => ({
        parse: () => null,
      }));

      mockLookup.mockResolvedValue({ address: "1.2.3.4" });
      mockFetch.mockResolvedValue(
        createMockResponse("<html><body><p>Content</p></body></html>", {
          "content-type": "text/html",
        })
      );

      const extracted = await fetchService.fetchHTML(results, options);

      expect(extracted).toHaveLength(1);
      expect(extracted[0]).toBeUndefined();
    });

    it("should handle content shorter than minimum length by using snippet", async () => {
      const results = createMockSearchResults(1);
      const options = createMockOptions({ minContentLength: 1000 });

      mockLookup.mockResolvedValue({ address: "1.2.3.4" });
      mockFetch.mockResolvedValue(
        createMockResponse("<html><body><p>Short</p></body></html>", {
          "content-type": "text/html",
        })
      );

      const extracted = await fetchService.fetchHTML(results, options);

      expect(extracted).toHaveLength(1);
      // Should fall back to snippet since extracted content is too short
      expect(typeof extracted[0]).toBe("string");
    });

    it("should use custom User-Agent from environment variable", async () => {
      const originalUserAgent = process.env.CRAWLER_USER_AGENT;
      process.env.CRAWLER_USER_AGENT = "Custom-Bot/1.0";

      const results = createMockSearchResults(1);
      const options = createMockOptions();

      mockLookup.mockResolvedValue({ address: "1.2.3.4" });
      mockFetch.mockResolvedValue(
        createMockResponse("<html><body><p>Content</p></body></html>", {
          "content-type": "text/html",
        })
      );

      await fetchService.fetchHTML(results, options);

      expect(mockFetch).toHaveBeenCalledWith(
        results[0].url,
        expect.objectContaining({
          headers: expect.objectContaining({
            "User-Agent": "Custom-Bot/1.0",
          }),
        })
      );

      // Restore original value
      if (originalUserAgent) {
        process.env.CRAWLER_USER_AGENT = originalUserAgent;
      } else {
        delete process.env.CRAWLER_USER_AGENT;
      }
    });

    it("should respect custom max bytes from environment", async () => {
      const originalMaxBytes = process.env.CRAWLER_MAX_BYTES;
      process.env.CRAWLER_MAX_BYTES = "1000";

      const results = createMockSearchResults(1);
      const options = createMockOptions();

      mockLookup.mockResolvedValue({ address: "1.2.3.4" });
      mockFetch.mockResolvedValue(
        createMockResponse("x".repeat(2000), {
          "content-type": "text/html",
        })
      );

      const extracted = await fetchService.fetchHTML(results, options);

      expect(extracted).toHaveLength(1);
      expect(extracted[0]).toBeUndefined();

      // Restore original value
      if (originalMaxBytes) {
        process.env.CRAWLER_MAX_BYTES = originalMaxBytes;
      } else {
        delete process.env.CRAWLER_MAX_BYTES;
      }
    });

    it("should handle stream reading with size limits", async () => {
      const results = createMockSearchResults(1);
      const options = createMockOptions();
      const largeContent = "x".repeat(3000000); // 3MB

      mockLookup.mockResolvedValue({ address: "1.2.3.4" });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === "content-type") return "text/html";
            return null;
          },
        },
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                done: false,
                value: new TextEncoder().encode(largeContent),
              })
              .mockResolvedValueOnce({
                done: true,
                value: null,
              }),
          }),
        },
      });

      const extracted = await fetchService.fetchHTML(results, options);

      expect(extracted).toHaveLength(1);
      expect(extracted[0]).toBeUndefined();
    });
  });

  describe("Error handling and edge cases", () => {
    it("should handle malformed URLs gracefully", async () => {
      const results: SearchResult[] = [
        {
          title: "Bad URL",
          snippet: "Bad URL content",
          url: "not-a-valid-url",
        },
      ];
      const options = createMockOptions();

      const extracted = await fetchService.fetchHTML(results, options);

      expect(extracted).toHaveLength(1);
      expect(extracted[0]).toBeUndefined();
    });

    it("should handle IPv6 addresses correctly", async () => {
      const results: SearchResult[] = [
        {
          title: "IPv6 Test",
          snippet: "IPv6 content",
          url: "http://[::1]/test", // IPv6 loopback
        },
      ];
      const options = createMockOptions();

      mockLookup.mockResolvedValue({ address: "::1" });

      const extracted = await fetchService.fetchHTML(results, options);

      expect(extracted).toHaveLength(1);
      expect(extracted[0]).toBeUndefined(); // Should be blocked as private
    });

    it("should handle concurrent fetch limits properly", async () => {
      const results = createMockSearchResults(10);
      const options = createMockOptions({ fetchConcurrency: 2 });

      mockLookup.mockResolvedValue({ address: "1.2.3.4" });
      mockFetch.mockResolvedValue(
        createMockResponse("<html><body><p>Content</p></body></html>", {
          "content-type": "text/html",
        })
      );

      const extracted = await fetchService.fetchHTML(results, options);

      expect(extracted).toHaveLength(5); // Limited by maxPagesToFetch
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it("should handle fetch timeouts", async () => {
      const results = createMockSearchResults(1);
      const options = createMockOptions();

      mockLookup.mockResolvedValue({ address: "1.2.3.4" });
      mockFetch.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Timeout")), 15000);
          })
      );

      const extracted = await fetchService.fetchHTML(results, options);

      expect(extracted).toHaveLength(1);
      expect(extracted[0]).toBeUndefined();
    });
  });
});
