import { SearchResult } from "../types";

export interface IHTMLFetch {
  fetchHTML(
    urls: SearchResult[],
    options?: unknown
  ): Promise<(string | undefined)[]>;
}
