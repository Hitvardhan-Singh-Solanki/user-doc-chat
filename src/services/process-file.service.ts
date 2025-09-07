import "dotenv/config";
import { Job, Worker } from "bullmq";
import { downloadFile } from "./minio.service";
import { VectorStoreService } from "./vector-store.service";
import { FileJob, Vector } from "../types";
import { sanitizeFile } from "../utils/sanitize-file";
import { connectionOptions, fileQueueName } from "../repos/bullmq.repo";
import { IDBStore } from "../interfaces/db-store.interface";
import { LLMService } from "./llm.service";

export class FileWorkerService {
  private db: IDBStore;
  private worker?: Worker;
  private vectorStore: VectorStoreService;
  private llmService: LLMService;

  constructor(
    dbStore: IDBStore,
    llmService = new LLMService(),
    vectorStore = new VectorStoreService(llmService)
  ) {
    this.db = dbStore;
    this.vectorStore = vectorStore;
    this.llmService = llmService;
  }

  public async startWorker() {
    this.worker = new Worker(fileQueueName, this.processJob.bind(this), {
      connection: connectionOptions,
    });

    this.worker.on("failed", (job, err) => {
      console.error(`Job ${job?.id} failed:`, err);
    });
    this.worker.on("error", (err) => {
      console.error("Worker error:", err);
    });

    console.log("Worker started successfully", this.worker.id);
  }

  private async processJob(job: Job) {
    const payload = job.data as FileJob;
    if (!payload?.fileId || !payload?.userId || !payload?.key)
      throw new Error("Invalid job data");

    try {
      console.log("Processing job:", job.id, payload);

      // Mark as processing
      await this.db.query(
        `
        UPDATE user_files
        SET status = $1, processing_started_at = NOW()
        WHERE id = $2
        `,
        ["processing", payload.fileId]
      );

      job.updateProgress(10);
      const fileBuffer = await downloadFile(payload.key);

      job.updateProgress(30);
      const sanitizedText = await sanitizeFile(fileBuffer);

      job.updateProgress(50);
      const chunks = this.llmService.chunkText(sanitizedText);

      const vectors: Vector[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await this.llmService.embeddingHF(chunks[i]);
        vectors.push({
          id: `${payload.key}-chunk-${i}`,
          values: embedding,
          metadata: {
            userId: payload.userId,
            fileId: payload.fileId,
            text: chunks[i],
          },
        });

        const progress = 50 + Math.floor(((i + 1) / chunks.length) * 40);
        job.updateProgress(progress);
      }

      await this.vectorStore.upsertVectors(vectors);

      console.log(`Processed ${payload.key}, total chunks: ${chunks.length}`);
      job.updateProgress(95);

      await this.db.query(
        `
        UPDATE user_files
        SET status = $1, processing_finished_at = NOW()
        WHERE id = $2
        `,
        ["processed", payload.fileId]
      );

      job.updateProgress(100);
      return { userId: payload.userId, fileId: payload.fileId };
    } catch (error) {
      console.error("Error processing job:", job.id, error);
      await this.db.query(
        `
        UPDATE user_files
        SET error_message = $1, status = $2, processing_finished_at = NOW()
        WHERE id = $3
        `,
        [(error as Error).message, "failed", payload.fileId]
      );
      throw error;
    }
  }
}
