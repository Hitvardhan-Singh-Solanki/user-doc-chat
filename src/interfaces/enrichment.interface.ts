import type { EnrichmentOptions, SearchResult } from "../types";

export interface IEnrichmentService {
  enrichIfUnknown(
    userQuestion: string,
    llmAnswer: string,
    options?: EnrichmentOptions
  ): Promise<SearchResult[] | null>;
}
