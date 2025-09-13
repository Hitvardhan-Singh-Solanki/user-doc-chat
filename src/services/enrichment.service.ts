import { v4 as uuid } from 'uuid';

import { ISearchAdapter } from '../interfaces/search-adapter.interface';
import { EnrichmentOptions, SearchResult } from '../types';
import { LLMService } from './llm.service';
import { VectorStoreService } from './vector-store.service';
import { DuckDuckGoAdapter } from './duckduckgo.service';
import { PromptService } from './prompt.service';

import { IHTMLFetch } from '../interfaces/html-fetch.interface';
import { IDeepResearch } from '../interfaces/deep-research.interface';
import { IEnrichmentService } from '../interfaces/enrichment.interface';

export class EnrichmentService implements IEnrichmentService {
  private readonly vectorStore: VectorStoreService;
  private readonly llmService: LLMService;
  private readonly searchAdapter: ISearchAdapter;
  private readonly promptService: PromptService;
  private readonly fetchHTML: IHTMLFetch;
  private readonly deepResearch: IDeepResearch;

  constructor(
    llmService: LLMService,
    vectorStore: VectorStoreService,
    fetchHTML: IHTMLFetch,
    deepResearch: IDeepResearch,
    searchAdapter?: ISearchAdapter,
  ) {
    this.llmService = llmService;
    this.vectorStore = vectorStore;
    this.fetchHTML = fetchHTML;
    this.deepResearch = deepResearch;
    this.searchAdapter = searchAdapter ?? new DuckDuckGoAdapter();
    this.promptService = new PromptService();
  }

  public async preEmbedDocument(
    docText: string,
    options: EnrichmentOptions = {},
  ): Promise<void> {
    const opts = { ...this.defaultOptions(), ...options };

    const sanitized = this.promptService.sanitizeText(docText);
    const chunks = this.chunkText(sanitized, opts.chunkSize, opts.chunkOverlap);

    for (const chunk of chunks) {
      try {
        const embedding = await this.llmService.embeddingHF(chunk);
        await this.vectorStore.upsertVectors([
          {
            id: `doc-${uuid()}`,
            values: embedding,
            metadata: {
              text: chunk,
              source: 'uploaded-doc',
              fileId: opts.fileId,
              crawledAt: new Date().toISOString(),
            },
          },
        ]);
      } catch (err) {
        console.error('preEmbedDocument: embed/upsert failed', err);
      }
    }
  }

  public async searchAndEmbed(
    query: string,
    options: EnrichmentOptions = {},
  ): Promise<SearchResult[]> {
    const opts = { ...this.defaultOptions(), ...options };

    const optimizedQuery = await this.generateOptimizedQuery(query);

    const results = await this.searchAdapter.search(
      optimizedQuery,
      opts.maxResults,
    );
    if (!results || results.length === 0) return [];

    const sourceText = await this.fetchHTML.fetchHTML(results, {
      maxPagesToFetch: opts.maxPagesToFetch,
      fetchConcurrency: opts.fetchConcurrency,
    });

    if (!sourceText || sourceText.length === 0) return results;

    for (let i = 0; i < results.length; i++) {
      const text = sourceText?.[i];
      if (!text || text.length < 50) continue;

      const deepSummary = await this.deepResearch.summarize(text);

      const sanitized = this.promptService.sanitizeText(text);
      const chunks = this.chunkText(
        sanitized,
        opts.chunkSize,
        opts.chunkOverlap,
      );

      for (const chunk of chunks) {
        try {
          const embedding = await this.llmService.embeddingHF(chunk);
          await this.vectorStore.upsertVectors([
            {
              id: `search-${uuid()}`,
              values: embedding,
              metadata: {
                text: chunk,
                source: results[i].url,
                title: results[i].title,
                snippet: results[i].snippet,
                fileId: opts.fileId,
                userId: opts.userId,
                crawledAt: new Date().toISOString(),
                deepSummary,
              },
            },
          ]);
        } catch (err) {
          console.error('searchAndEmbed: embed/upsert failed', err);
        }
      }
    }

    return results;
  }

  public async enrichIfUnknown(
    userQuestion: string,
    llmAnswer: string,
    options: EnrichmentOptions = {},
  ): Promise<SearchResult[] | null> {
    if (typeof llmAnswer !== 'string') return null;
    if (llmAnswer.toLowerCase().includes("i don't know")) {
      return await this.searchAndEmbed(userQuestion, options);
    }
    return null;
  }

  private defaultOptions(): EnrichmentOptions {
    return {
      maxResults: 5,
      maxPagesToFetch: 5,
      fetchConcurrency: 3,
      minContentLength: 200,
      chunkSize: Number(process.env.CHUNK_SIZE) || 800,
      chunkOverlap: Number(process.env.CHUNK_OVERLAP) || 100,
      userId: `(public)-${uuid()}`,
      fileId: `(external-search)-${uuid()}`,
    };
  }

  private chunkText(text: string, size = 800, overlap = 100): string[] {
    if (!text || text.length <= size) return [text];
    const chunks: string[] = [];
    const step = Math.max(1, size - Math.max(0, overlap));
    let i = 0;
    while (i < text.length) {
      chunks.push(text.slice(i, i + size));
      i += step;
    }
    return chunks;
  }

  private async generateOptimizedQuery(userQuestion: string): Promise<string> {
    const prompt =
      this.promptService.generateOptimizedSearchPrompt(userQuestion);

    try {
      const completion = await this.llmService.generateText(prompt);
      return completion;
    } catch (error) {
      console.error('Failed to generate optimized query:', error);
      return userQuestion; // Fallback to the original question
    }
  }
}
