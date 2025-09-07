import { v4 as uuid } from "uuid";
import { LLMService } from "./llm.service";
import { VectorStoreService } from "./vector-store.service";
import { ISearchAdapter } from "../interfaces/search-adapter.interface";
import { SearchResult } from "../types";
import { sanitizeText } from "../utils/prompt";
import { DuckDuckGoAdapter } from "./duckduckgo.service";

export class EnrichmentService {
  private vectorStore: VectorStoreService;
  private llmService: LLMService;
  private searchAdapter?: ISearchAdapter;

  constructor(
    llmService: LLMService,
    vectorStore: VectorStoreService,
    searchAdapter?: ISearchAdapter
  ) {
    this.llmService = llmService;
    this.vectorStore = vectorStore;
    this.searchAdapter = searchAdapter ?? new DuckDuckGoAdapter();
  }

  async preEmbedDocument(docText: string): Promise<void> {
    const prompt = `Extract all key laws, sections, clauses, or important points from the following document:\n\n${sanitizeText(
      docText
    )}`;

    const chunks = this.llmService.chunkText(docText, 500, 50);

    for (const chunk of chunks) {
      const embedding = await this.llmService.embeddingHF(chunk);
      await this.vectorStore.upsertVectors([
        {
          id: `doc-${uuid()}`,
          values: embedding,
          metadata: { text: chunk },
        },
      ]);
    }
  }

  async searchAndEmbed(
    query: string,
    maxResults: number = 5
  ): Promise<SearchResult[]> {
    if (!this.searchAdapter) throw new Error("No search adapter configured");

    const results = await this.searchAdapter.search(query, maxResults);

    for (const result of results) {
      const embedding = await this.llmService.embeddingHF(result.snippet);
      await this.vectorStore.upsertVectors([
        {
          id: `search-${uuid()}`,
          values: embedding,
          metadata: {
            text: result.snippet,
            url: result.url,
            title: result.title,
          },
        },
      ]);
    }

    return results;
  }

  async enrichIfUnknown(
    userQuestion: string,
    llmAnswer: string
  ): Promise<SearchResult[] | null> {
    if (llmAnswer.toLowerCase().includes("i don't know")) {
      return await this.searchAndEmbed(userQuestion);
    }
    return null;
  }
}
