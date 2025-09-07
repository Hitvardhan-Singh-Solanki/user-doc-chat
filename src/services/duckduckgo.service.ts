import { ISearchAdapter } from "../interfaces/search-adapter.interface";
import { SearchResult } from "../types";

export class DuckDuckGoAdapter implements ISearchAdapter {
  async search(query: string, maxResults: number = 5): Promise<SearchResult[]> {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(
      query
    )}&format=json&no_html=1&skip_disambig=1`;

    const res = await fetch(url);
    if (!res.ok)
      throw new Error(`DuckDuckGo API failed: ${res.status} ${res.statusText}`);

    const data = await res.json();

    const results: SearchResult[] = [];
    const topics = data.RelatedTopics || [];
    for (const topic of topics) {
      if (results.length >= maxResults) break;

      if (topic.Text && topic.FirstURL) {
        results.push({
          title: topic.Text,
          snippet: topic.Text,
          url: topic.FirstURL,
        });
      } else if (topic.Topics) {
        for (const sub of topic.Topics) {
          if (results.length >= maxResults) break;
          if (sub.Text && sub.FirstURL) {
            results.push({
              title: sub.Text,
              snippet: sub.Text,
              url: sub.FirstURL,
            });
          }
        }
      }
    }

    return results;
  }
}
