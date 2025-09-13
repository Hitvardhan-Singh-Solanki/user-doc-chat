import pLimit from 'p-limit';
import net from 'net';
import { JSDOM } from 'jsdom';
import { lookup } from 'dns/promises';
import { IHTMLFetch } from '../interfaces/html-fetch.interface';
import { EnrichmentOptions, SearchResult } from '../types';
import { Readability } from '@mozilla/readability';

export class FetchHTMLService implements IHTMLFetch {
  async fetchHTML(
    results: SearchResult[],
    options: EnrichmentOptions,
  ): Promise<(string | undefined)[]> {
    const toFetch = results.slice(
      0,
      Math.min(results.length, options.maxPagesToFetch || 5),
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
          console.error('searchAndEmbed: processing failed for', r.url, err);
          return undefined;
        }
      }),
    );

    const res = await Promise.all(tasks);

    if (res) return res;

    return [];
  }

  private async fetchExtract(
    result: SearchResult,
    opts: Required<EnrichmentOptions>,
  ): Promise<string> {
    const pageText = await this.fetchPageText(result.url);

    const sourceText =
      pageText && pageText.length >= opts.minContentLength
        ? pageText
        : result.snippet || '';

    if (!sourceText || sourceText.length < 50) {
      return '';
    }

    return sourceText;
  }

  private async fetchPageText(
    url: string,
    timeoutMs = 10000,
    redirectCount = 0,
  ): Promise<string | null> {
    const MAX_REDIRECTS = 5;

    try {
      if (
        !this.validateUrlForSSRF(url) ||
        !(await this.isPublicAddress(new URL(url).hostname))
      ) {
        return null;
      }

      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          ...(process.env.CRAWLER_USER_AGENT
            ? { 'User-Agent': process.env.CRAWLER_USER_AGENT }
            : { 'User-Agent': 'user-doc-chat/1.0 (+enrichment)' }),
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      clearTimeout(id);

      const redirection = await this.handleRedirects(
        res,
        redirectCount,
        MAX_REDIRECTS,
        url,
        timeoutMs,
      );
      if (redirection !== undefined) {
        return redirection;
      }

      if (!this.validateResponse(res)) {
        return null;
      }

      const html = await this.fetchAndDecodeBody(res);
      if (!html) {
        return null;
      }

      return this.parseHtml(html, url);
    } catch (err) {
      console.debug('fetchPageText error', err);
      return null;
    }
  }

  private validateUrlForSSRF(url: string): boolean {
    try {
      const u = new URL(url);
      if (!/^https?:$/i.test(u.protocol)) return false;

      const host = u.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host.endsWith('.local') ||
        /^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
        host === '::1'
      ) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  private async isPublicAddress(host: string): Promise<boolean> {
    try {
      const { address } = await lookup(host, { all: false });
      return !this.isPrivateAddress(address);
    } catch {
      return false;
    }
  }

  private async handleRedirects(
    res: Response,
    redirectCount: number,
    maxRedirects: number,
    url: string,
    timeoutMs: number,
  ): Promise<string | null | undefined> {
    if (res.status >= 300 && res.status < 400) {
      if (redirectCount >= maxRedirects) {
        return null; // Stop if max redirects hit
      }
      const newUrl = res.headers.get('location');
      if (newUrl) {
        return await this.fetchPageText(newUrl, timeoutMs, redirectCount + 1);
      }
      return null; // Redirect status but no location header
    }
    return undefined; // Not a redirect, continue
  }

  private validateResponse(res: Response): boolean {
    if (!res.ok) {
      return false;
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('html') && !ct.includes('xml')) {
      return false;
    }
    const len = Number(res.headers.get('content-length') || '0');
    const maxBytes = Number(process.env.CRAWLER_MAX_BYTES || 2_000_000);
    if (len && len > maxBytes) {
      return false;
    }
    return true;
  }

  private async fetchAndDecodeBody(res: Response): Promise<string | null> {
    const maxBytes = Number(process.env.CRAWLER_MAX_BYTES || 2_000_000);
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
            return null; // Body is too large
          }
          chunks.push(value);
        }
      }
      html = new TextDecoder().decode(Buffer.concat(chunks as any));
    } else {
      html = await res.text();
    }
    return html;
  }

  private parseHtml(html: string, url: string): string | null {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (!article || !article.textContent) {
      return null;
    }
    const text = article.textContent.replace(/\s+/g, ' ').trim();
    return text;
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
    return a === '::1' || a.startsWith('fe80:') || /^fc|fd/.test(a.slice(0, 2));
  }
}
