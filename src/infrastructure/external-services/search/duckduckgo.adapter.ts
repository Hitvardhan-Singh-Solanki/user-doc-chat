import { ISearchAdapter } from '@interfaces/search-adapter.interface';
import { SearchResult } from '@shared/types';
import { config } from '@config';

export class DuckDuckGoAdapter implements ISearchAdapter {
  async search(
    query: string,
    maxResults: number = 5,
    signal?: AbortSignal,
  ): Promise<SearchResult[]> {
    const url = this.buildSearchUrl(query);
    const effectiveSignal = this.setupAbortSignal(signal);
    const data = await this.fetchSearchData(url, effectiveSignal);

    return this.processSearchResults(data, maxResults);
  }

  private buildSearchUrl(query: string): string {
    return `https://api.duckduckgo.com/?q=${encodeURIComponent(
      query,
    )}&format=json&no_html=1&skip_disambig=1`;
  }

  private setupAbortSignal(signal?: AbortSignal): AbortSignal {
    if (signal) {
      return signal;
    }

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);
    return controller.signal;
  }

  private async fetchSearchData(
    url: string,
    signal: AbortSignal,
  ): Promise<unknown> {
    const res = await fetch(url, {
      signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': config.CRAWLER_USER_AGENT,
      },
    });

    if (!res.ok) {
      throw new Error(`DuckDuckGo API failed: ${res.status} ${res.statusText}`);
    }

    return await res.json();
  }

  private processSearchResults(
    data: unknown,
    maxResults: number,
  ): SearchResult[] {
    const results: SearchResult[] = [];
    const searchData = data as { RelatedTopics?: unknown[] };
    const topics = searchData.RelatedTopics || [];

    for (const topic of topics) {
      if (results.length >= maxResults) break;

      const topicData = topic as {
        Text?: string;
        FirstURL?: string;
        Topics?: unknown[];
      };
      if (topicData.Text && topicData.FirstURL) {
        results.push({
          title: topicData.Text,
          snippet: topicData.Text,
          url: topicData.FirstURL,
        });
      } else if (topicData.Topics) {
        this.processSubTopics(topicData.Topics, results, maxResults);
      }
    }

    return results;
  }

  private processSubTopics(
    subTopics: unknown[],
    results: SearchResult[],
    maxResults: number,
  ): void {
    for (const sub of subTopics) {
      if (results.length >= maxResults) break;

      const subData = sub as { Text?: string; FirstURL?: string };
      if (subData.Text && subData.FirstURL) {
        results.push({
          title: subData.Text,
          snippet: subData.Text,
          url: subData.FirstURL,
        });
      }
    }
  }
}
