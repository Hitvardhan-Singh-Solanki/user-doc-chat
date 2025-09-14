import pLimit from 'p-limit';
import net from 'net';
import { JSDOM } from 'jsdom';
import { lookup } from 'dns/promises';
import { IHTMLFetch } from '../interfaces/html-fetch.interface';
import { EnrichmentOptions, SearchResult } from '../types';
import { Readability } from '@mozilla/readability';
import { logger } from '../config/logger'; // Assuming you have a configured logger

export class FetchHTMLService implements IHTMLFetch {
  private readonly log = logger.child({ component: 'FetchHTMLService' });

  async fetchHTML(
    results: SearchResult[],
    options: EnrichmentOptions,
  ): Promise<(string | undefined)[]> {
    this.log.info(
      {
        totalResults: results.length,
        maxPagesToFetch: options.maxPagesToFetch,
        fetchConcurrency: options.fetchConcurrency,
      },
      'Starting HTML fetch tasks.',
    );

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
      chunkOverlap: options.chunkOverlap ?? 100, // Ensure all props exist
    } as Required<EnrichmentOptions>;

    const tasks = toFetch.map((r) =>
      limit(async () => {
        try {
          return await this.fetchExtract(r, requiredOptions);
        } catch (err) {
          this.log.error(
            { url: r.url, err: (err as Error).message },
            'Processing failed for URL. Returning undefined.',
          );
          return undefined;
        }
      }),
    );

    const res = await Promise.all(tasks);

    this.log.info('All HTML fetch tasks completed.');

    if (res) return res;

    return [];
  }

  private async fetchExtract(
    result: SearchResult,
    opts: Required<EnrichmentOptions>,
  ): Promise<string> {
    this.log.info(
      { url: result.url },
      'Fetching and extracting text from URL.',
    );
    const pageText = await this.fetchPageText(result.url);

    const sourceText =
      pageText && pageText.length >= opts.minContentLength
        ? pageText
        : result.snippet || '';

    if (!sourceText || sourceText.length < 50) {
      this.log.warn(
        { url: result.url, textLength: sourceText?.length },
        'Content from URL is too short. Skipping.',
      );
      return '';
    }

    this.log.info(
      { url: result.url, textLength: sourceText.length },
      'Successfully fetched and extracted text.',
    );
    return sourceText;
  }

  private async fetchPageText(
    url: string,
    timeoutMs = 10000,
    redirectCount = 0,
  ): Promise<string | null> {
    const MAX_REDIRECTS = 5;
    const log = this.log.child({ url, redirectCount });

    try {
      if (!this.validateUrlForSSRF(url)) {
        log.error('URL failed SSRF validation.');
        return null;
      }
      if (!(await this.isPublicAddress(new URL(url).hostname))) {
        log.error("URL's hostname is not a public address.");
        return null;
      }

      log.debug('Starting fetch request with timeout.');
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
        if (redirection === null) {
          log.warn('Maximum redirects reached or invalid redirect location.');
        }
        return redirection;
      }

      if (!this.validateResponse(res)) {
        log.warn(
          { status: res.status, contentType: res.headers.get('content-type') },
          'Invalid response received.',
        );
        return null;
      }

      const html = await this.fetchAndDecodeBody(res);
      if (!html) {
        log.warn('HTML body was empty or too large.');
        return null;
      }

      const parsedText = this.parseHtml(html, url);
      if (!parsedText) {
        log.warn('Failed to parse HTML into readable text.');
      }
      return parsedText;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        log.warn('Fetch request timed out.');
      } else {
        log.error(
          { err, stack: err.stack },
          'FetchPageText encountered an error.',
        );
      }
      return null;
    }
  }

  private validateUrlForSSRF(url: string): boolean {
    try {
      const u = new URL(url);
      const isSecure = /^https?:$/i.test(u.protocol);
      if (!isSecure) {
        this.log.warn({ url }, 'URL has an invalid protocol.');
        return false;
      }

      const host = u.hostname.toLowerCase();
      const isPrivate =
        host === 'localhost' ||
        host.endsWith('.local') ||
        /^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
        host === '::1';
      if (isPrivate) {
        this.log.warn({ host }, "URL's hostname is a private address.");
        return false;
      }

      return true;
    } catch {
      this.log.error({ url }, 'URL validation failed due to invalid format.');
      return false;
    }
  }

  private async isPublicAddress(host: string): Promise<boolean> {
    try {
      const { address } = await lookup(host, { all: false });
      const isPublic = !this.isPrivateAddress(address);
      if (!isPublic) {
        this.log.warn(
          { host, address },
          'DNS lookup resolved to a private IP.',
        );
      }
      return isPublic;
    } catch (err) {
      this.log.error(
        { host, err: (err as Error).message },
        'DNS lookup failed.',
      );
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
    const log = this.log.child({ url });
    if (res.status >= 300 && res.status < 400) {
      log.info({ status: res.status, redirectCount }, 'Handling redirect.');
      if (redirectCount >= maxRedirects) {
        log.warn('Max redirects hit.');
        return null;
      }
      const loc = res.headers.get('location');
      if (loc) {
        const nextUrl = new URL(loc, url).toString();
        log.debug({ nextUrl }, 'Redirecting to new URL.');
        return await this.fetchPageText(nextUrl, timeoutMs, redirectCount + 1);
      }
      log.warn('Redirect status but no location header.');
      return null;
    }
    return undefined;
  }

  private validateResponse(res: Response): boolean {
    if (!res.ok) {
      this.log.warn(
        { status: res.status, url: res.url },
        'Response status is not OK.',
      );
      return false;
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const isHtml = ct.includes('html') || ct.includes('xml');
    if (!isHtml) {
      this.log.warn(
        { contentType: ct, url: res.url },
        'Content-type is not HTML/XML.',
      );
      return false;
    }
    const len = Number(res.headers.get('content-length') || '0');
    const maxBytes = Number(process.env.CRAWLER_MAX_BYTES || 2_000_000);
    if (len && len > maxBytes) {
      this.log.warn(
        { contentLength: len, maxBytes, url: res.url },
        'Content-Length exceeds max bytes.',
      );
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
            this.log.warn(
              { received, maxBytes, url: res.url },
              'HTML body size exceeds max bytes during stream.',
            );
            return null;
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
    try {
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      if (!article || !article.textContent) {
        this.log.warn({ url }, 'Readability failed to parse article text.');
        return null;
      }
      const text = article.textContent.replace(/\s+/g, ' ').trim();
      this.log.debug(
        { url, textLength: text.length },
        'Successfully parsed HTML to text.',
      );
      return text;
    } catch (err) {
      this.log.error(
        { url, err: (err as Error).message },
        'An error occurred during HTML parsing.',
      );
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
    const a = address.toLowerCase();
    return a === '::1' || a.startsWith('fe80:') || /^fc|fd/.test(a.slice(0, 2));
  }
}
