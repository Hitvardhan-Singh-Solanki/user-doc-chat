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
  ): Promise<any> {
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

  private processSearchResults(data: any, maxResults: number): SearchResult[] {
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
        this.processSubTopics(topic.Topics, results, maxResults);
      }
    }

    return results;
  }

  private processSubTopics(
    subTopics: any[],
    results: SearchResult[],
    maxResults: number,
  ): void {
    for (const sub of subTopics) {
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
