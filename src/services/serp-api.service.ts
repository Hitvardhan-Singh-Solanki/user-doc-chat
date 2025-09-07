import { ISearchAdapter } from "../interfaces/search-adapter.interface";
import { SearchResult } from "../types";

export class SerpApiAdapter implements ISearchAdapter {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("SERP_API_KEY required");
    this.apiKey = apiKey;
  }

  async search(query: string, maxResults = 5): Promise<SearchResult[]> {
    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(
      query
    )}&num=${maxResults}&api_key=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok)
      throw new Error(`SERP API failed: ${res.status} ${res.statusText}`);

    const data = await res.json();
    return (data.organic_results || []).map((r: any) => ({
      title: r.title,
      snippet: r.snippet,
      url: r.link,
    }));
  }
}
