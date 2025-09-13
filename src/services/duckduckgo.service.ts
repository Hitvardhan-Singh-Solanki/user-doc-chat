import { ISearchAdapter } from '../interfaces/search-adapter.interface';
import { SearchResult } from '../types';

export class DuckDuckGoAdapter implements ISearchAdapter {
  async search(
    query: string,
    maxResults: number = 5,
    signal?: AbortSignal,
  ): Promise<SearchResult[]> {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(
      query,
    )}&format=json&no_html=1&skip_disambig=1`;

    const controller = signal ? undefined : new AbortController();
    const effectiveSignal = signal ?? controller!.signal;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), 8000)
      : undefined;

    let res: Response;
    try {
      res = await fetch(url, {
        signal: effectiveSignal,
        headers: {
          Accept: 'application/json',
          'User-Agent': process.env.CRAWLER_USER_AGENT!,
        },
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

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
