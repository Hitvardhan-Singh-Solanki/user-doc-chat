import { ISearchAdapter } from '../../../shared/interfaces/search-adapter.interface';
import { SearchResult } from '../../../shared/types';

export class BingSearchAdapter implements ISearchAdapter {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('BING_API_KEY required');
    this.apiKey = apiKey;
  }

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    // Validate query parameter
    if (typeof query !== 'string') {
      throw new Error('Query must be a string');
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      throw new Error('Query cannot be empty or contain only whitespace');
    }

    // Validate maxResults parameter
    if (typeof maxResults !== 'number' || !Number.isInteger(maxResults)) {
      throw new Error('maxResults must be an integer');
    }

    // Ensure maxResults is within allowed range
    if (maxResults < 1 || maxResults > 50) {
      throw new Error(
        `maxResults must be between 1 and 50, got: ${maxResults}`,
      );
    }

    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(
      trimmedQuery,
    )}&count=${maxResults}`;
    const res = await fetch(url, {
      headers: { 'Ocp-Apim-Subscription-Key': this.apiKey },
    });
    if (!res.ok)
      throw new Error(`Bing Search failed: ${res.status} ${res.statusText}`);
    const data = await res.json();

    return (data.webPages?.value || []).map((r: any) => ({
      title: r.name,
      snippet: r.snippet,
      url: r.url,
    }));
  }
}
