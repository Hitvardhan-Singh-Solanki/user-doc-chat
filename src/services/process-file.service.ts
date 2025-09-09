import "dotenv/config";
import { Job, Worker } from "bullmq";
import { v4 as uuid } from "uuid";
import { downloadFile } from "./minio.service";
import { VectorStoreService } from "./vector-store.service";
import { FileJob, Vector } from "../types";
import { sanitizeFile } from "../utils/sanitize-file";
import { connectionOptions, fileQueueName } from "../repos/bullmq.repo";
import { IDBStore } from "../interfaces/db-store.interface";
import { LLMService } from "./llm.service";
import { EnrichmentService } from "./enrichment.service";
import { DeepResearchService } from "./deep-research.service";
import { FetchHTMLService } from "./fetch.service";

export class FileWorkerService {
  private db: IDBStore;
  private worker?: Worker;
  private vectorStore: VectorStoreService;
  private llmService: LLMService;
  private enrichmentService: EnrichmentService;

  constructor(
    dbStore: IDBStore,
    llmService: LLMService = new LLMService(),
    enrichmentService: EnrichmentService,
    fetchHtmlService = new FetchHTMLService(),
    deepResearchService: DeepResearchService = new DeepResearchService(
      llmService
    ),
    vectorStore: VectorStoreService = new VectorStoreService(
      llmService,
      "pinecone",
      fetchHtmlService,
      deepResearchService
    )
  ) {
    this.db = dbStore;
    this.llmService = llmService;
    this.llmService.enrichmentService = enrichmentService;
    this.vectorStore = vectorStore;
    this.enrichmentService = enrichmentService;
  }

  /** Start the BullMQ worker */
  public async startWorker() {
    this.worker = new Worker(fileQueueName, this.processJob.bind(this), {
      connection: connectionOptions,
    });

    this.worker.on("failed", (job, err) =>
      console.error(`Job ${job?.id} failed:`, err)
    );
    this.worker.on("error", (err) => console.error("Worker error:", err));

    console.log("FileWorkerService started", this.worker.id);
  }

  /** Main job processor */
  private async processJob(job: Job) {
    const payload = job.data as FileJob;
    if (!payload?.fileId || !payload?.userId || !payload?.key)
      throw new Error("Invalid job data");

    try {
      job.updateProgress(5);

      await this.markFileProcessing(payload.fileId);

      job.updateProgress(10);

      const text = await this.downloadAndSanitize(payload, job);

      job.updateProgress(40);
      // Extract and pre-embed legal chunks
      await this.extractAndPreEmbedLegalChunks(payload, text, job);

      job.updateProgress(70);
      // Embed full document
      await this.embedFullDocument(payload, text, job);

      job.updateProgress(80);
      await this.markFileProcessed(payload.fileId);
      job.updateProgress(100);

      return { userId: payload.userId, fileId: payload.fileId };
    } catch (error) {
      await this.markFileFailed(payload.fileId, error as Error);
      throw error;
    }
  }

  // ------------------ Private helpers ------------------

  private async markFileProcessing(fileId: string) {
    await this.db.query(
      `UPDATE user_files SET status=$1, processing_started_at=NOW() WHERE id=$2`,
      ["processing", fileId]
    );
  }

  private async markFileProcessed(fileId: string) {
    await this.db.query(
      `UPDATE user_files SET status=$1, processing_finished_at=NOW() WHERE id=$2`,
      ["processed", fileId]
    );
  }

  private async markFileFailed(fileId: string, error: Error) {
    await this.db.query(
      `UPDATE user_files SET error_message=$1, status=$2, processing_finished_at=NOW() WHERE id=$3`,
      [error.message, "failed", fileId]
    );
  }

  /** Step 1: Download and sanitize */
  private async downloadAndSanitize(
    payload: FileJob,
    job: Job
  ): Promise<string> {
    const fileBuffer = await downloadFile(payload.key);
    job.updateProgress(20);

    const sanitizedText = await sanitizeFile(fileBuffer);
    job.updateProgress(35);

    return sanitizedText;
  }

  /** Step 2: Extract and pre-embed legal chunks */
  private async extractAndPreEmbedLegalChunks(
    payload: FileJob,
    text: string,
    job: Job
  ) {
    let legalChunks = await this.extractLegalChunksFromText(text, 25);
    if (!legalChunks.length) return;

    job.updateProgress(40);
    for (let i = 0; i < legalChunks.length; i++) {
      await this.preEmbedChunk(payload, legalChunks[i]);
      job.updateProgress(40 + Math.floor(((i + 1) / legalChunks.length) * 20));
    }
  }

  /** Step 3: Embed full document */
  private async embedFullDocument(payload: FileJob, text: string, job: Job) {
    const chunks = this.llmService.chunkText(
      text,
      Number(process.env.CHUNK_SIZE) || 800,
      Number(process.env.CHUNK_OVERLAP) || 100
    );

    const batch: Vector[] = [];
    for (let i = 0; i < chunks.length; i++) {
      batch.push(await this.createVector(payload, chunks[i], i));

      if (batch.length >= 50) {
        await this.vectorStore.upsertVectors(batch.splice(0));
      }

      job.updateProgress(60 + Math.floor(((i + 1) / chunks.length) * 35));
    }

    if (batch.length) await this.vectorStore.upsertVectors(batch);
  }

  /** Utility: Pre-embed chunk via enrichment service or direct embed */
  private async preEmbedChunk(
    payload: FileJob,
    chunk: { sectionTitle: string; content: string }
  ) {
    if (this.enrichmentService) {
      await this.enrichmentService.preEmbedDocument(chunk.content, {
        fileId: payload.fileId,
        userId: payload.userId,
        sectionTitle: chunk.sectionTitle,
        source: "pre-legal-extract",
      });
    } else {
      const vector = await this.createVector(payload, chunk.content, uuid(), {
        sectionTitle: chunk.sectionTitle,
        type: "legal-section",
      });
      await this.vectorStore.upsertVectors([vector]);
    }
  }

  /** Utility: Create vector with metadata */
  private async createVector(
    payload: FileJob,
    text: string,
    id: string | number,
    extraMeta: Record<string, any> = {}
  ): Promise<Vector> {
    const embedding = await this.llmService.embeddingHF(text);
    return {
      id: `${payload.fileId}-${id}`,
      values: embedding,
      metadata: {
        fileId: payload.fileId,
        userId: payload.userId,
        text,
        ...extraMeta,
        createdAt: new Date().toISOString(),
      },
    };
  }

  /** Utility: Extract legal chunks with LLM fallback to regex */
  private async extractLegalChunksFromText(
    text: string,
    maxChunks: number
  ): Promise<{ sectionTitle: string; content: string }[]> {
    const cleaned = text.trim();
    if (!cleaned) return [];

    // If LLM supports legal extraction
    if ((this.llmService as any).extractLegalChunks) {
      try {
        const chunks = await (this.llmService as any).extractLegalChunks(
          cleaned
        );
        return chunks.slice(0, maxChunks);
      } catch (err) {
        console.warn("LLM extraction failed, fallback to regex:", err);
      }
    }

    // Fallback: simple regex-based extraction
    const paragraphs = cleaned
      .split(/\n{1,}/)
      .filter((p) => p.trim().length > 50);
    return paragraphs.slice(0, maxChunks).map((p, i) => ({
      sectionTitle: `Section ${i + 1}`,
      content: p,
    }));
  }
}
