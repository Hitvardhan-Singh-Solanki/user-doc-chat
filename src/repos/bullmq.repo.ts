import { Queue } from "bullmq";

export const queueName = "file-processing";

export const fileQueue = new Queue("file-processing", {
  connection: {
    host: process.env.REDIS_HOST || "redis",
    port: Number(process.env.REDIS_PORT || 6379),
  },
});
