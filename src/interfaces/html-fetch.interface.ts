import { SearchResult, EnrichmentOptions } from "../types";

export interface IHTMLFetch {
  fetchHTML(
    results: SearchResult[],
    options?: EnrichmentOptions
  ): Promise<(string | undefined)[]>;
}
