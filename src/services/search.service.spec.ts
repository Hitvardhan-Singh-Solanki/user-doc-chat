import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchService } from './search.service';
import { ISearchAdapter } from '../interfaces/search-adapter.interface';
import { SearchResult } from '../types';

describe('SearchService', () => {
  let searchService: SearchService;
  let mockAdapter: ISearchAdapter;

  const mockResults: SearchResult[] = [
    {
      title: 'Test Result 1',
      snippet: 'This is the first test result snippet',
      url: 'https://example.com/result1',
    },
    {
      title: 'Test Result 2',
      snippet: 'This is the second test result snippet',
      url: 'https://example.com/result2',
    },
  ];

  beforeEach(() => {
    // Create mock adapter
    mockAdapter = {
      search: vi.fn(),
    };

    searchService = new SearchService(mockAdapter);

    // Reset mocks
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create SearchService with provided adapter', () => {
      const adapter = { search: vi.fn() };
      const service = new SearchService(adapter);

      expect(service).toBeInstanceOf(SearchService);
    });
  });

  describe('search', () => {
    it('should search with default maxResults (5)', async () => {
      const query = 'test query';
      mockAdapter.search = vi.fn().mockResolvedValue(mockResults);

      const result = await searchService.search(query);

      expect(mockAdapter.search).toHaveBeenCalledWith(query, 5);
      expect(result).toEqual(mockResults);
    });

    it('should search with custom maxResults', async () => {
      const query = 'test query';
      const maxResults = 10;
      mockAdapter.search = vi.fn().mockResolvedValue(mockResults);

      const result = await searchService.search(query, maxResults);

      expect(mockAdapter.search).toHaveBeenCalledWith(query, maxResults);
      expect(result).toEqual(mockResults);
    });

    it('should handle empty query', async () => {
      const query = '';
      mockAdapter.search = vi.fn().mockResolvedValue([]);

      const result = await searchService.search(query);

      expect(mockAdapter.search).toHaveBeenCalledWith(query, 5);
      expect(result).toEqual([]);
    });

    it('should handle empty search results', async () => {
      const query = 'no results query';
      mockAdapter.search = vi.fn().mockResolvedValue([]);

      const result = await searchService.search(query);

      expect(mockAdapter.search).toHaveBeenCalledWith(query, 5);
      expect(result).toEqual([]);
    });

    it('should handle maxResults of 0', async () => {
      const query = 'test query';
      const maxResults = 0;
      mockAdapter.search = vi.fn().mockResolvedValue([]);

      const result = await searchService.search(query, maxResults);

      expect(mockAdapter.search).toHaveBeenCalledWith(query, maxResults);
      expect(result).toEqual([]);
    });

    it('should handle maxResults of 1', async () => {
      const query = 'test query';
      const maxResults = 1;
      const singleResult = [mockResults[0]];
      mockAdapter.search = vi.fn().mockResolvedValue(singleResult);

      const result = await searchService.search(query, maxResults);

      expect(mockAdapter.search).toHaveBeenCalledWith(query, maxResults);
      expect(result).toEqual(singleResult);
    });

    it('should handle large maxResults', async () => {
      const query = 'test query';
      const maxResults = 100;
      mockAdapter.search = vi.fn().mockResolvedValue(mockResults);

      const result = await searchService.search(query, maxResults);

      expect(mockAdapter.search).toHaveBeenCalledWith(query, maxResults);
      expect(result).toEqual(mockResults);
    });

    it('should handle negative maxResults', async () => {
      const query = 'test query';
      const maxResults = -1;
      mockAdapter.search = vi.fn().mockResolvedValue([]);

      const result = await searchService.search(query, maxResults);

      expect(mockAdapter.search).toHaveBeenCalledWith(query, maxResults);
      expect(result).toEqual([]);
    });

    it('should forward adapter search errors', async () => {
      const query = 'test query';
      const searchError = new Error('Search adapter failed');
      mockAdapter.search = vi.fn().mockRejectedValue(searchError);

      await expect(searchService.search(query)).rejects.toThrow(
        'Search adapter failed',
      );

      expect(mockAdapter.search).toHaveBeenCalledWith(query, 5);
    });

    it('should handle adapter returning null', async () => {
      const query = 'test query';
      mockAdapter.search = vi.fn().mockResolvedValue(null as any);

      const result = await searchService.search(query);

      expect(mockAdapter.search).toHaveBeenCalledWith(query, 5);
      expect(result).toBeNull();
    });

    it('should handle adapter returning undefined', async () => {
      const query = 'test query';
      mockAdapter.search = vi.fn().mockResolvedValue(undefined as any);

      const result = await searchService.search(query);

      expect(mockAdapter.search).toHaveBeenCalledWith(query, 5);
      expect(result).toBeUndefined();
    });

    it('should handle special characters in query', async () => {
      const query = 'test query with special chars: @#$%^&*()';
      mockAdapter.search = vi.fn().mockResolvedValue(mockResults);

      const result = await searchService.search(query);

      expect(mockAdapter.search).toHaveBeenCalledWith(query, 5);
      expect(result).toEqual(mockResults);
    });

    it('should handle very long query', async () => {
      const query = 'a'.repeat(1000);
      mockAdapter.search = vi.fn().mockResolvedValue(mockResults);

      const result = await searchService.search(query);

      expect(mockAdapter.search).toHaveBeenCalledWith(query, 5);
      expect(result).toEqual(mockResults);
    });

    it('should handle unicode characters in query', async () => {
      const query = 'test query with unicode: 中文 🚀 éñ';
      mockAdapter.search = vi.fn().mockResolvedValue(mockResults);

      const result = await searchService.search(query);

      expect(mockAdapter.search).toHaveBeenCalledWith(query, 5);
      expect(result).toEqual(mockResults);
    });

    it('should handle whitespace-only query', async () => {
      const query = '   \n\t   ';
      mockAdapter.search = vi.fn().mockResolvedValue([]);

      const result = await searchService.search(query);

      expect(mockAdapter.search).toHaveBeenCalledWith(query, 5);
      expect(result).toEqual([]);
    });

    it('should handle query with only numbers', async () => {
      const query = '12345';
      mockAdapter.search = vi.fn().mockResolvedValue(mockResults);

      const result = await searchService.search(query);

      expect(mockAdapter.search).toHaveBeenCalledWith(query, 5);
      expect(result).toEqual(mockResults);
    });

    it('should handle results with missing optional fields', async () => {
      const incompleteResults: SearchResult[] = [
        {
          title: 'Result with minimal fields',
          snippet: 'Minimal snippet',
          url: 'https://example.com/minimal',
        },
      ];
      const query = 'test query';
      mockAdapter.search = vi.fn().mockResolvedValue(incompleteResults);

      const result = await searchService.search(query);

      expect(mockAdapter.search).toHaveBeenCalledWith(query, 5);
      expect(result).toEqual(incompleteResults);
    });

    it('should handle results with additional fields', async () => {
      const extendedResults = [
        {
          title: 'Extended Result',
          snippet: 'Extended snippet',
          url: 'https://example.com/extended',
          extra_field: 'extra value',
          timestamp: new Date(),
        },
      ];
      const query = 'test query';
      mockAdapter.search = vi.fn().mockResolvedValue(extendedResults as any);

      const result = await searchService.search(query);

      expect(mockAdapter.search).toHaveBeenCalledWith(query, 5);
      expect(result).toEqual(extendedResults);
    });

    it('should pass through adapter response without modification', async () => {
      const query = 'test query';
      const adapterResponse = { custom: 'response', format: true };
      mockAdapter.search = vi.fn().mockResolvedValue(adapterResponse as any);

      const result = await searchService.search(query);

      expect(result).toBe(adapterResponse); // Same reference
      expect(result).toEqual(adapterResponse);
    });

    it('should handle async adapter delays', async () => {
      const query = 'test query';
      let resolveSearch: (value: SearchResult[]) => void;

      const searchPromise = new Promise<SearchResult[]>((resolve) => {
        resolveSearch = resolve;
      });

      mockAdapter.search = vi.fn().mockReturnValue(searchPromise);

      const resultPromise = searchService.search(query);

      // Resolve the search after a delay
      setTimeout(() => {
        resolveSearch!(mockResults);
      }, 10);

      const result = await resultPromise;
      expect(result).toEqual(mockResults);
    });
  });

  describe('Error handling', () => {
    it('should handle adapter throwing synchronous errors', async () => {
      const query = 'test query';
      const syncError = new Error('Synchronous adapter error');
      mockAdapter.search = vi.fn().mockImplementation(() => {
        throw syncError;
      });

      await expect(searchService.search(query)).rejects.toThrow(
        'Synchronous adapter error',
      );
    });

    it('should handle adapter returning rejected promise', async () => {
      const query = 'test query';
      const asyncError = new Error('Async adapter error');
      mockAdapter.search = vi.fn().mockRejectedValue(asyncError);

      await expect(searchService.search(query)).rejects.toThrow(
        'Async adapter error',
      );
    });

    it('should handle adapter timeout scenarios', async () => {
      const query = 'test query';
      const timeoutError = new Error('Request timeout');
      mockAdapter.search = vi.fn().mockRejectedValue(timeoutError);

      await expect(searchService.search(query)).rejects.toThrow(
        'Request timeout',
      );
    });
  });

  describe('Integration scenarios', () => {
    it('should work correctly with multiple sequential searches', async () => {
      const query1 = 'first query';
      const query2 = 'second query';
      const results1 = [mockResults[0]];
      const results2 = [mockResults[1]];

      mockAdapter.search = vi
        .fn()
        .mockResolvedValueOnce(results1)
        .mockResolvedValueOnce(results2);

      const result1 = await searchService.search(query1);
      const result2 = await searchService.search(query2);

      expect(result1).toEqual(results1);
      expect(result2).toEqual(results2);
      expect(mockAdapter.search).toHaveBeenCalledTimes(2);
      expect(mockAdapter.search).toHaveBeenNthCalledWith(1, query1, 5);
      expect(mockAdapter.search).toHaveBeenNthCalledWith(2, query2, 5);
    });

    it('should work correctly with concurrent searches', async () => {
      const query1 = 'concurrent query 1';
      const query2 = 'concurrent query 2';
      const results1 = [mockResults[0]];
      const results2 = [mockResults[1]];

      mockAdapter.search = vi.fn().mockImplementation(async (query) => {
        // Simulate different delays
        await new Promise((resolve) =>
          setTimeout(resolve, query.includes('1') ? 10 : 5),
        );
        return query.includes('1') ? results1 : results2;
      });

      const [result1, result2] = await Promise.all([
        searchService.search(query1),
        searchService.search(query2),
      ]);

      expect(result1).toEqual(results1);
      expect(result2).toEqual(results2);
      expect(mockAdapter.search).toHaveBeenCalledTimes(2);
    });
  });
});
