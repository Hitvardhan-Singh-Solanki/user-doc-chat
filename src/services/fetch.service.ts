import pLimit from "p-limit";
import net from "net";
import { JSDOM } from "jsdom";
import { lookup } from "dns/promises";
import { IHTMLFetch } from "../interfaces/html-fetch.interface";
import { EnrichmentOptions, SearchResult } from "../types";
import { Readability } from "@mozilla/readability";

export class FetchHTMLService implements IHTMLFetch {
  async fetchHTML(
    results: SearchResult[],
    options: EnrichmentOptions
  ): Promise<(string | undefined)[]> {
    const toFetch = results.slice(
      0,
      Math.min(results.length, options.maxPagesToFetch || 5)
    );

    const limit = pLimit(options.fetchConcurrency || 2);

    const requiredOptions: Required<EnrichmentOptions> = {
      ...options,
      maxPagesToFetch: options.maxPagesToFetch ?? 5,
      fetchConcurrency: options.fetchConcurrency ?? 2,
      minContentLength: options.minContentLength ?? 2000,
      chunkSize: options.chunkSize ?? 1000,
      maxResults: options.maxResults ?? 10,
    } as Required<EnrichmentOptions>;

    const tasks = toFetch.map((r) =>
      limit(async () => {
        try {
          return await this.fetchExtract(r, requiredOptions);
        } catch (err) {
          console.error("searchAndEmbed: processing failed for", r.url, err);
          return undefined;
        }
      })
    );

    const res = await Promise.all(tasks);

    if (res) return res;

    return [];
  }

  private async fetchExtract(
    result: SearchResult,
    opts: Required<EnrichmentOptions>
  ): Promise<string> {
    const pageText = await this.fetchPageText(result.url);

    const sourceText =
      pageText && pageText.length >= opts.minContentLength
        ? pageText
        : result.snippet || "";

    if (!sourceText || sourceText.length < 50) {
      return "";
    }

    return sourceText;
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

      // Resolve and block private/reserved targets
      try {
        const { address } = await lookup(host, { all: false });
        if (this.isPrivateAddress(address)) return null;
      } catch {
        return null;
      }

      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          ...(process.env.CRAWLER_USER_AGENT
            ? { "User-Agent": process.env.CRAWLER_USER_AGENT }
            : { "User-Agent": "user-doc-chat/1.0 (+enrichment)" }),
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (res.status >= 300 && res.status < 400) {
        clearTimeout(id);
        return null;
      }

      if (!res.ok) return null;

      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("html") && !ct.includes("xml")) {
        return null;
      }
      const len = Number(res.headers.get("content-length") || "0");
      const maxBytes = Number(process.env.CRAWLER_MAX_BYTES || 2_000_000); // ~2MB
      if (len && len > maxBytes) return null;

      let html: string;

      if (res.body) {
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            received += value.byteLength;
            if (received > maxBytes) {
              controller.abort();
              clearTimeout(id);
              return null;
            }
            chunks.push(value);
          }
        }
        html = new TextDecoder().decode(Buffer.concat(chunks as any));
      } else {
        html = await res.text();
      }

      clearTimeout(id);

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

  private isPrivateAddress(address: string): boolean {
    if (net.isIP(address) === 4) {
      return (
        /^10\./.test(address) ||
        /^127\./.test(address) ||
        /^192\.168\./.test(address) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
      );
    }
    // IPv6: loopback, link-local, unique-local
    const a = address.toLowerCase();
    return a === "::1" || a.startsWith("fe80:") || /^fc|fd/.test(a.slice(0, 2));
  }
}
