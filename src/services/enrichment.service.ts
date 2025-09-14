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
import { logger } from '../config/logger'; // Assuming you have a configured logger

export class EnrichmentService implements IEnrichmentService {
  private readonly vectorStore: VectorStoreService;
  private readonly llmService: LLMService;
  private readonly searchAdapter: ISearchAdapter;
  private readonly promptService: PromptService;
  private readonly fetchHTML: IHTMLFetch;
  private readonly deepResearch: IDeepResearch;
  private readonly log = logger.child({ component: 'EnrichmentService' });

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
    this.log.info('EnrichmentService initialized');
  }

  public async preEmbedDocument(
    docText: string,
    options: EnrichmentOptions = {},
  ): Promise<void> {
    const opts = { ...this.defaultOptions(), ...options };
    const { fileId, userId } = opts;
    const log = this.log.child({ handler: 'preEmbedDocument', fileId, userId });
    log.info('Starting document pre-embedding process.');
    const sanitized = this.promptService.sanitizeText(docText);
    const chunks = this.chunkText(sanitized, opts.chunkSize, opts.chunkOverlap);
    log.info({ chunkCount: chunks.length }, 'Document chunked for embedding.');

    for (const chunk of chunks) {
      try {
        log.debug('Processing a document chunk.');
        const embedding = await this.llmService.getEmbedding(chunk);
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
        log.debug('Document chunk embedded and upserted successfully.');
      } catch (err) {
        log.error(
          { err, stack: (err as Error).stack },
          'Failed to embed or upsert document chunk.',
        );
      }
    }
    log.info('Document pre-embedding process completed.');
  }

  public async searchAndEmbed(
    query: string,
    options: EnrichmentOptions = {},
  ): Promise<SearchResult[]> {
    const opts = { ...this.defaultOptions(), ...options };
    const { fileId, userId } = opts;
    const log = this.log.child({ handler: 'searchAndEmbed', fileId, userId });
    log.info({ query }, 'Starting search and embed process.');

    const optimizedQuery = await this.generateOptimizedQuery(query);
    log.info({ optimizedQuery }, 'Generated optimized search query.');

    const results = await this.searchAdapter.search(
      optimizedQuery,
      opts.maxResults,
    );
    if (!results || results.length === 0) {
      log.warn('No search results found. Returning empty array.');
      return [];
    }
    log.info(
      { resultsCount: results.length },
      'Search results retrieved. Starting HTML fetching.',
    );

    const sourceText = await this.fetchHTML.fetchHTML(results, {
      maxPagesToFetch: opts.maxPagesToFetch,
      fetchConcurrency: opts.fetchConcurrency,
      minContentLength: opts.minContentLength,
    });

    if (!sourceText || sourceText.length === 0) {
      log.warn(
        'No useful HTML content fetched. Returning search results without embedding.',
      );
      return results;
    }

    log.info('HTML content fetched. Starting embedding process.');
    for (let i = 0; i < results.length; i++) {
      const text = sourceText?.[i];
      if (!text || text.length < 50) {
        log.debug(
          { url: results[i].url },
          'Skipping embedding for short or empty content.',
        );
        continue;
      }

      const deepSummary = await this.deepResearch.summarize(text);
      const sanitized = this.promptService.sanitizeText(text);
      const chunks = this.chunkText(
        sanitized,
        opts.chunkSize,
        opts.chunkOverlap,
      );
      log.debug(
        { url: results[i].url, chunkCount: chunks.length },
        'Chunking text for embedding.',
      );

      for (const chunk of chunks) {
        try {
          const embedding = await this.llmService.getEmbedding(chunk);
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
          log.debug(
            { url: results[i].url },
            'Chunk embedded and upserted successfully.',
          );
        } catch (err) {
          log.error(
            { err, stack: (err as Error).stack, url: results[i].url },
            'Failed to embed or upsert search result chunk.',
          );
        }
      }
    }
    log.info('Search and embed process completed.');
    return results;
  }

  public async enrichIfUnknown(
    userQuestion: string,
    llmAnswer: string,
    options: EnrichmentOptions = {},
  ): Promise<SearchResult[] | null> {
    const log = this.log.child({
      handler: 'enrichIfUnknown',
      userId: options.userId,
    });
    log.info(
      { userQuestion },
      'Checking if LLM answer indicates a need for enrichment.',
    );
    if (typeof llmAnswer !== 'string') {
      log.warn('LLM answer is not a string. Skipping enrichment.');
      return null;
    }
    if (llmAnswer.toLowerCase().includes("i don't know")) {
      log.info(
        'LLM answer indicates "unknown". Starting search and embed process.',
      );
      return await this.searchAndEmbed(userQuestion, options);
    }
    log.info('LLM answer is confident. No enrichment needed.');
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
    const log = this.log.child({ handler: 'generateOptimizedQuery' });
    log.info({ userQuestion }, 'Generating optimized search query.');
    const prompt =
      this.promptService.generateOptimizedSearchPrompt(userQuestion);
    try {
      const completion = await this.llmService.generateText(prompt);
      log.info(
        { optimizedQuery: completion },
        'Successfully generated optimized query.',
      );
      return completion;
    } catch (error) {
      log.error(
        { error, stack: (error as Error).stack },
        'Failed to generate optimized query. Falling back to original question.',
      );
      return userQuestion;
    }
  }
}
