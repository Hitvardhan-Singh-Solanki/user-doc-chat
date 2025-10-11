import { ISearchAdapter } from '@interfaces/search-adapter.interface';
import { SearchResult } from '@shared/types';

export class BingSearchAdapter implements ISearchAdapter {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('BING_API_KEY required');
    this.apiKey = apiKey;
  }

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    this.validateSearchParameters(query, maxResults);

    const trimmedQuery = query.trim();
    const url = this.buildSearchUrl(trimmedQuery, maxResults);
    const data = await this.fetchSearchResults(url);

    return this.transformSearchResults(data);
  }

  private validateSearchParameters(query: string, maxResults: number): void {
    if (typeof query !== 'string') {
      throw new Error('Query must be a string');
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      throw new Error('Query cannot be empty or contain only whitespace');
    }

    if (typeof maxResults !== 'number' || !Number.isInteger(maxResults)) {
      throw new Error('maxResults must be an integer');
    }

    if (maxResults < 1 || maxResults > 50) {
      throw new Error(
        `maxResults must be between 1 and 50, got: ${maxResults}`,
      );
    }
  }

  private buildSearchUrl(query: string, maxResults: number): string {
    return `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(
      query,
    )}&count=${maxResults}`;
  }

  private async fetchSearchResults(url: string): Promise<unknown> {
    const res = await fetch(url, {
      headers: { 'Ocp-Apim-Subscription-Key': this.apiKey },
    });

    if (!res.ok) {
      throw new Error(`Bing Search failed: ${res.status} ${res.statusText}`);
    }

    return await res.json();
  }

  private transformSearchResults(data: unknown): SearchResult[] {
    const searchData = data as {
      webPages?: { value?: { name: string; snippet: string; url: string }[] };
    };
    return (searchData.webPages?.value || []).map(
      (r: { name: string; snippet: string; url: string }) => ({
        title: r.name,
        snippet: r.snippet,
        url: r.url,
      }),
    );
  }
}
