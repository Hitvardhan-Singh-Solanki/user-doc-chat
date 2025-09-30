import { ISearchAdapter } from '../common/interfaces/search-adapter.interface';
import { SearchResult } from '../common/types';

export class BingSearchAdapter implements ISearchAdapter {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('BING_API_KEY required');
    this.apiKey = apiKey;
  }

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(
      query,
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
