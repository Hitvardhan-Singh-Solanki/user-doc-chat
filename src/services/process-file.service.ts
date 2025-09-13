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

export class FileWorkerService {
  private db: IDBStore;
  private worker?: Worker;
  private vectorStore: VectorStoreService;
  private llmService: LLMService;
  private enrichmentService: EnrichmentService;

  constructor(
    dbStore: IDBStore,
    llmService: LLMService,
    enrichmentService: EnrichmentService,
    vectorStore: VectorStoreService
  ) {
    this.db = dbStore;
    this.llmService = llmService;
    this.enrichmentService = enrichmentService;
    this.vectorStore = vectorStore;
  }

  /** Start the BullMQ worker */
  public async startWorker() {
    this.worker = new Worker(fileQueueName, this.processJob.bind(this), {
      connection: connectionOptions,
      concurrency: 5,
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

      await this.enrichmentService.preEmbedDocument(text, {
        fileId: payload.fileId,
        userId: payload.userId,
      });

      job.updateProgress(70);

      // Embed full document
      const chunks = this.llmService.chunkText(
        text,
        Number(process.env.CHUNK_SIZE) || 800,
        Number(process.env.CHUNK_OVERLAP) || 100
      );

      const batch: Vector[] = [];
      for (let i = 0; i < chunks.length; i++) {
        batch.push(
          await this.createVector(payload, chunks[i], uuid(), {
            type: "full-document",
          })
        );

        if (batch.length >= 50) {
          await this.vectorStore.upsertVectors(batch.splice(0));
        }

        job.updateProgress(70 + Math.floor(((i + 1) / chunks.length) * 20));
      }
      if (batch.length) await this.vectorStore.upsertVectors(batch);

      job.updateProgress(90);
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

  /** Utility: Create vector with metadata */
  private async createVector(
    payload: FileJob,
    text: string,
    id: string,
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
}
