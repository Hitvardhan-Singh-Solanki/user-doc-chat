import { ISearchAdapter } from '../common/interfaces/search-adapter.interface';
import { SearchResult } from '../common/types';

export class SerpApiAdapter implements ISearchAdapter {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error('SERP_API_KEY required');
    this.apiKey = apiKey;
  }

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    if (!query || !query.trim()) throw new Error('query required');
    const params = new URLSearchParams({
      engine: 'google',
      q: query,
      num: String(Math.max(1, maxResults)),
      api_key: this.apiKey,
      hl: 'en',
      gl: 'us',
    });
    const res = await fetch(`https://serpapi.com/search.json?${params}`, {
      signal: (AbortSignal as any).timeout
        ? (AbortSignal as any).timeout(8000)
        : undefined,
      headers: { Accept: 'application/json' },
    });

    const data = await res.json();
    const items = (data.organic_results || []).map((r: any) => ({
      title: r.title ?? '',
      snippet: r.snippet ?? '',
      url: r.link ?? '',
    }));
    return items.slice(0, maxResults);
  }
}
