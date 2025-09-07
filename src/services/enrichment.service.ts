import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import pLimit from "p-limit";
import { v4 as uuid } from "uuid";

import { ISearchAdapter } from "../interfaces/search-adapter.interface";
import { EnrichmentOptions, SearchResult } from "../types";
import { sanitizeText } from "../utils/prompt";
import { LLMService } from "./llm.service";
import { VectorStoreService } from "./vector-store.service";
import { DuckDuckGoAdapter } from "./duckduckgo.service";

export class EnrichmentService {
  private vectorStore: VectorStoreService;
  private llmService: LLMService;
  private searchAdapter: ISearchAdapter;

  constructor(
    llmService: LLMService,
    vectorStore: VectorStoreService,
    searchAdapter?: ISearchAdapter
  ) {
    this.llmService = llmService;
    this.vectorStore = vectorStore;
    this.searchAdapter = searchAdapter ?? new DuckDuckGoAdapter();
  }

  private defaultOptions(): Required<EnrichmentOptions> {
    return {
      maxResults: 5,
      maxPagesToFetch: 5,
      fetchConcurrency: 3,
      minContentLength: 200,
      chunkSize: Number(process.env.CHUNK_SIZE) || 800,
      chunkOverlap: Number(process.env.CHUNK_OVERLAP) || 100,
      userId: "(public)",
      fileId: "(external-search)",
    };
  }

  public async preEmbedDocument(
    docText: string,
    options: EnrichmentOptions = {}
  ): Promise<void> {
    const opts = { ...this.defaultOptions(), ...options };

    const sanitized = sanitizeText(docText);
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
              source: "uploaded-doc",
              fileId: opts.fileId,
              crawledAt: new Date().toISOString(),
            },
          },
        ]);
      } catch (err) {
        console.error("preEmbedDocument: embed/upsert failed", err);
      }
    }
  }

  public async searchAndEmbed(
    query: string,
    options: EnrichmentOptions = {}
  ): Promise<SearchResult[]> {
    const opts = { ...this.defaultOptions(), ...options };

    const results = await this.searchAdapter.search(query, opts.maxResults);
    if (!results || results.length === 0) return [];

    const toFetch = results.slice(
      0,
      Math.min(results.length, opts.maxPagesToFetch)
    );

    const limit = pLimit(opts.fetchConcurrency);

    const tasks = toFetch.map((r) =>
      limit(async () => {
        try {
          await this.fetchExtractAndUpsert(r, opts);
        } catch (err) {
          console.error("searchAndEmbed: processing failed for", r.url, err);
        }
      })
    );

    await Promise.all(tasks);

    return results;
  }

  public async enrichIfUnknown(
    userQuestion: string,
    llmAnswer: string,
    options: EnrichmentOptions = {}
  ): Promise<SearchResult[] | null> {
    if (typeof llmAnswer !== "string") return null;
    if (llmAnswer.toLowerCase().includes("i don't know")) {
      return await this.searchAndEmbed(userQuestion, options);
    }
    return null;
  }

  private async fetchExtractAndUpsert(
    result: SearchResult,
    opts: Required<EnrichmentOptions>
  ): Promise<void> {
    const pageText = await this.fetchPageText(result.url);

    const sourceText =
      pageText && pageText.length >= opts.minContentLength
        ? pageText
        : result.snippet || "";

    if (!sourceText || sourceText.length < 50) {
      return;
    }

    const sanitized = sanitizeText(sourceText);

    const chunks = this.chunkText(sanitized, opts.chunkSize, opts.chunkOverlap);

    for (const chunk of chunks) {
      try {
        const embedding = await this.llmService.embeddingHF(chunk);
        await this.vectorStore.upsertVectors([
          {
            id: `crawl-${uuid()}`,
            values: embedding,
            metadata: {
              text: chunk,
              title: result.title,
              url: result.url,
              source: this.searchAdapter.constructor.name || "search-adapter",
              crawledAt: new Date().toISOString(),
            },
          },
        ]);
      } catch (err) {
        console.error(
          "fetchExtractAndUpsert: embed/upsert error for",
          result.url,
          err
        );
      }
    }
  }

  private async fetchPageText(
    url: string,
    timeoutMs = 10000
  ): Promise<string | null> {
    try {
      // Basic SSRF hardening
      const u = new URL(url);
      if (!/^https?:$/i.test(u.protocol)) return null;
      const host = u.hostname.toLowerCase();
      if (
        host === "localhost" ||
        host.endsWith(".local") ||
        /^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
        host === "::1"
      ) {
        return null;
      }

      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        signal: controller.signal,
        // ...
      });
      clearTimeout(id);
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }
        signal: controller.signal,
        headers: {
        headers: {
          ...(process.env.CRAWLER_USER_AGENT
            ? { "User-Agent": process.env.CRAWLER_USER_AGENT }
            : { "User-Agent": "user-doc-chat/1.0 (+enrichment)" }),
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      clearTimeout(id);

      if (!res.ok) return null;

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("html") && !ct.includes("xml")) {
        return null;
      }
      const len = Number(res.headers.get("content-length") || "0");
      const maxBytes = Number(process.env.CRAWLER_MAX_BYTES || 2_000_000); // ~2MB
      if (len && len > maxBytes) {
        return null;
      }

      const html = await res.text();
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      if (!article || !article.textContent) return null;

      const text = article.textContent.replace(/\s+/g, " ").trim();
      return text;
    } catch (err) {
      console.debug("fetchPageText error", err);
      return null;
    }
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
}
