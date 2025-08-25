import "dotenv/config";
import { Job, Worker } from "bullmq";
import { downloadFile } from "./minio.service";
import { chunkText, embeddingHF } from "./embeddings.service";
import { upsertVectors } from "./pinecone.service";
import { FileJob, Vector } from "../types";
import { sanitizeFile } from "../utils/sanitize-file";
import { connectionOptions, queueName } from "../repos/bullmq.repo";
import { db } from "../repos/db.repo";

export async function startWorker() {
  const worker = new Worker(queueName, processJob, {
    connection: connectionOptions,
  });

  console.log("Worker started successfully", worker.id);
}

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

    job.updateProgress(50);
    const chunks = chunkText(sanitizedText);

    const vectors: Vector[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await embeddingHF(chunks[i]);
      vectors.push({
        id: `${payload.key}-chunk-${i}`,
        values: embedding,
        metadata: { userId: payload.userId, fileId: payload.fileId },
      });

      const progress = 50 + Math.floor(((i + 1) / chunks.length) * 40);
      job.updateProgress(progress);
    }

    await upsertVectors(vectors);
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
