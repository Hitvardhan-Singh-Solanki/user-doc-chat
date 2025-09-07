import { SearchResult } from "../types";

export interface ISearchAdapter {
  search(
    query: string,
    maxResults?: number,
    signal?: AbortSignal
  ): Promise<SearchResult[]>;
}
