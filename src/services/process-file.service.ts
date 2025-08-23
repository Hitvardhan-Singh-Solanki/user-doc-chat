import "dotenv/config";
import { Worker, ConnectionOptions } from "bullmq";
import { downloadFile } from "./minio.service";
import { chunkText, embedText } from "./embeddings.service";
import { upsertVectors } from "./pinecone.service";
import { FileJob, Vector } from "../types";
import { sanitizeFile } from "../utils/sanitize-file";
import { queueName } from "../repos/bullmq.repo";
import { db } from "../repos/db.repo";

function parseRedisUrl(url: string): ConnectionOptions {
  const { hostname, port, username, password } = new URL(url);
  return {
    host: hostname,
    port: Number(port),
    username: username || undefined,
    password: password || undefined,
  };
}

export async function startWorker() {
  const redisUrl = process.env.REDIS_URL!;
  const { hostname, port } = new URL(redisUrl);
  console.log("Connecting to Redis:", `${hostname}:${port}`);
  const connectionOptions = parseRedisUrl(redisUrl);

  const worker = new Worker(
    queueName,
    async (job) => {
      try {
        console.log("Processing job:", job.id, job.data);
        db.query(
          `
          UPDATE user_files
          SET status = $1, processing_started_at = NOW()
          WHERE id = $2
          `,
          ["processing", (job.data as FileJob).fileId]
        );

        const payload = job.data as FileJob;
        const fileBuffer = await downloadFile(payload.key);

        // Sanitize file based on type
        const sanitizedText = await sanitizeFile(fileBuffer);

        // Chunk sanitized content
        const chunks = chunkText(sanitizedText);

        const vectors: Vector[] = [];
        for (let i = 0; i < chunks.length; i++) {
          const embedding = await embedText(chunks[i]);
          vectors.push({
            id: `${payload.key}-chunk-${i}`,
            values: embedding,
            metadata: { userId: payload.userId },
          });
        }

        await upsertVectors(vectors);
        console.log(`Processed ${payload.key}, total chunks: ${chunks.length}`);

        await db.query(
          `
          UPDATE user_files
          SET status = $1, processing_finished_at = NOW()
          WHERE id = $2
          `,
          ["processed", payload.fileId]
        );
      } catch (error) {
        console.error("Error processing job:", job.id, error);
        await db.query(
          `
          UPDATE user_files
          SET error_message = $1, status = $2
          WHERE id = $2
          `,
          [(error as Error).message, "failed"]
        );
        throw error;
      }
    },
    { connection: connectionOptions }
  );

  console.log("Worker started successfully", worker.id);
}
