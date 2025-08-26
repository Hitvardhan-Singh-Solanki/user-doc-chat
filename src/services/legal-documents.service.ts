import { Job, Worker } from "bullmq";
import { db } from "../repos/db.repo";
import { LegalDocument, LegalDocumentJobData } from "../types";
import { LLMService } from "./llm.service";
import { PineconeService } from "./pinecone.service";
import cheerio from "cheerio";
import {
  legalDocumentsQueueName,
  connectionOptions,
  legalDocumentsQueue,
} from "../repos/bullmq.repo";
import cron from "node-cron";

export class LegalDocumentsService {
  private llmService: LLMService;
  private pineconeService: PineconeService;
  private worker?: Worker;

  constructor(private concurrency: number = 5, private batchSize: number = 10) {
    this.llmService = new LLMService();
    this.pineconeService = new PineconeService();
  }

  /** Start BullMQ worker */
  async startWorker() {
    this.worker = new Worker(
      legalDocumentsQueueName,
      this.processLegalDocument.bind(this),
      { connection: connectionOptions, concurrency: this.concurrency }
    );

    console.log("Legal documents worker started:", this.worker.id);
  }

  /** Process a single document job */
  private async processLegalDocument(job: Job) {
    const doc = job.data as LegalDocumentJobData;
    try {
      console.log(`Processing document: ${doc.source_url}`);

      const html = await this.fetchDocumentContent(doc.source_url);
      if (!html) throw new Error("Empty content");

      const chunks = this.llmService.chunkText(html, 500, 50);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = await this.llmService.embeddingPython(chunk);
        await this.pineconeService.upsertVectors([
          {
            id: `${doc.id}-${i}`,
            values: embedding,
            metadata: { documentId: doc.id, url: doc.source_url, text: chunk },
          },
        ]);
      }

      await db.query(
        `UPDATE legal_documents
         SET status = 'processed', last_crawled = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [doc.id]
      );
      console.log(`✅ Processed: ${doc.source_url}`);
    } catch (err) {
      console.error(`Failed: ${doc.source_url}`, err);
      await db.query(
        `UPDATE legal_documents
         SET status = 'failed', updated_at = NOW()
         WHERE id = $1`,
        [doc.id]
      );
    }
  }

  /** Fetch HTML content with timeout */
  private async fetchDocumentContent(
    url: string,
    timeout = 15000
  ): Promise<string | null> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      const $ = cheerio.load(html);
      $("script, style, noscript").remove();
      const text = $("body").text().replace(/\s+/g, " ").trim();
      return text || null;
    } catch (err) {
      if ((err as any).name === "AbortError") {
        console.error(`Fetch timeout: ${url}`);
      } else {
        console.error("Fetch failed:", url, err);
      }
      return null;
    } finally {
      clearTimeout(id);
    }
  }

  /** Enqueue new documents from DB */
  async enqueueDocuments() {
    const trx = await db.connect();

    try {
      await trx.query("BEGIN");
      const documents = await this.fetchAndMarkBatch(this.batchSize);

      for (const doc of documents) {
        await legalDocumentsQueue.add("processDoc", doc, {
          removeOnComplete: true,
          removeOnFail: false,
        });
      }

      await trx.query("COMMIT");
      console.log(`Enqueued ${documents.length} documents`);
    } catch (err) {
      await trx.query("ROLLBACK");
      console.error("Enqueue failed:", err);
    } finally {
      trx.release();
    }
  }

  /** Fetch batch and mark as processing */
  private async fetchAndMarkBatch(batchSize: number): Promise<LegalDocument[]> {
    const query = `
      UPDATE legal_documents
      SET status = 'processing', updated_at = NOW()
      WHERE id IN (
        SELECT id
        FROM legal_documents
        WHERE status = 'new'
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *;
    `;
    const { rows } = await db.query<LegalDocument>(query, [batchSize]);
    return rows;
  }

  scheduleEnqueueCron(cronExpression = "0 * * * *") {
    cron.schedule(cronExpression, async () => {
      console.log("Cron: enqueueing legal documents batch...");
      await this.enqueueDocuments();
    });
  }
}
