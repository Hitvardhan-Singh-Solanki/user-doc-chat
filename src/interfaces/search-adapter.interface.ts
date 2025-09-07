import { SearchResult } from "../types";

export interface ISearchAdapter {
  search(query: string, maxResults?: number): Promise<SearchResult[]>;
}
