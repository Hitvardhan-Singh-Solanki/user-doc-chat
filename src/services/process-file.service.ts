import "dotenv/config";
import { Job, Worker } from "bullmq";
import { downloadFile } from "./minio.service";
import { PineconeService } from "./pinecone.service";
import { FileJob, Vector } from "../types";
import { sanitizeFile } from "../utils/sanitize-file";
import { connectionOptions, queueName } from "../repos/bullmq.repo";
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
  const worker = new Worker(queueName, processJob, {
    connection: connectionOptions,
  });

  console.log("Worker started successfully", worker.id);
}

/**
 * Processes a file ingestion job: downloads, sanitizes, chunks, embeds, upserts vectors, and updates DB progress/status.
 *
 * The function expects `job.data` to be a FileJob containing `fileId`, `userId`, and `key`. It updates the file record to
 * "processing", reports incremental progress to the job, downloads and sanitizes the file, splits text into chunks,
 * obtains embeddings for each chunk via the LLM service, upserts the resulting vectors into the vector store, and marks the
 * file as "processed" when complete. On error it records the error message and sets the file status to "failed" before
 * rethrowing.
 *
 * @returns An object with the processed file's `userId` and `fileId`.
 * @throws Error if required job payload fields are missing (invalid job data) or if processing fails (errors are logged,
 * recorded to the DB, and rethrown).
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
