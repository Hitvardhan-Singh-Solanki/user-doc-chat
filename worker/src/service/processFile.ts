import "dotenv/config";
import { Worker, ConnectionOptions } from "bullmq";
import { downloadFile } from "./minio";
import { chunkText, embedText } from "./embeddings";
import { upsertVectors } from "./pinecone";
import { FileJob, Vector } from "../types/job";

const queueName = "file-processing";

function parseRedisUrl(url: string): ConnectionOptions {
  const { hostname, port, username, password } = new URL(url);

  return {
    host: hostname,
    port: Number(port),
    username: username || undefined,
    password: password || undefined,
  };
}

async function startWorker() {
  const redisUrl = process.env.REDIS_URL!;
  console.log("Connecting to Redis:", redisUrl);

  const connectionOptions = parseRedisUrl(redisUrl);

  const worker = new Worker(
    queueName,
    async (job) => {
      const payload = job.data as FileJob;
      const fileBuffer = await downloadFile(payload.bucket, payload.key);
      const text = fileBuffer.toString("utf-8");

      const chunks = chunkText(text);

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
    },
    { connection: connectionOptions }
  );

  console.log("Worker started successfully", worker.id);
}

setTimeout(() => {
  startWorker().catch((err) => console.error("Worker failed:", err));
}, 3000);
