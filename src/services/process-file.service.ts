import "dotenv/config";
import { Job, Worker } from "bullmq";
import { downloadFile } from "./minio.service";
import { PineconeService } from "./pinecone.service";
import { FileJob, Vector } from "../types";
import { sanitizeFile } from "../utils/sanitize-file";
import { connectionOptions, fileQueueName } from "../repos/bullmq.repo";
import { db } from "../repos/db.repo";
import { LLMService } from "./llm.service";

/**
 * Starts a BullMQ Worker to process jobs from the configured queue.
 *
 * Creates a new Worker bound to `queueName` using `processJob` as the processor and `connectionOptions` for Redis,
 * then logs the worker id. The function does not block; worker runs asynchronously after startup.
 *
 * @returns A promise that resolves once the worker has been created.
 */
export async function startWorker() {
  const worker = new Worker(fileQueueName, processJob, {
    connection: connectionOptions,
  });

  console.log("Worker started successfully", worker.id);
}

/**
 * Process a file ingestion job: download, sanitize, chunk, embed, upsert vectors, and update DB progress/status.
 *
 * Expects `job.data` to be a FileJob with `fileId`, `userId`, and `key`. The function updates the corresponding
 * user_files row to "processing", reports incremental progress to the job, downloads and sanitizes the file,
 * splits the text into chunks via LLMService, obtains embeddings for each chunk, upserts vectors to the vector store
 * via PineconeService, and marks the file "processed" on success. On error it records the error message and status
 * "failed" in the DB and rethrows the error.
 *
 * @returns An object containing the processed `userId` and `fileId`.
 */
async function processJob(job: Job) {
  try {
    console.log("Processing job:", job.id, job.data);
    const payload = job.data as FileJob;
    if (!payload?.fileId || !payload?.userId || !payload?.key)
      throw new Error("Invalid job data");
    await db.query(
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

    const llmService = new LLMService();

    job.updateProgress(50);
    const chunks = llmService.chunkText(sanitizedText);

    const vectors: Vector[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await llmService.embeddingPython(chunks[i]);
      vectors.push({
        id: `${payload.key}-chunk-${i}`,
        values: embedding,
        metadata: { userId: payload.userId, fileId: payload.fileId },
      });

      const progress = 50 + Math.floor(((i + 1) / chunks.length) * 40);
      job.updateProgress(progress);
    }
    const pineconeService = new PineconeService();

    await pineconeService.upsertVectors(vectors);
    console.log(`Processed ${payload.key}, total chunks: ${chunks.length}`);
    job.updateProgress(95);

    await db.query(
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
    await db.query(
      `
          UPDATE user_files
          SET error_message = $1, status = $2
          WHERE id = $3
          `,
      [(error as Error).message, "failed", (job.data as FileJob).fileId]
    );
    throw error;
  }
}
