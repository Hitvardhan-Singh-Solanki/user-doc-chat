import { Queue, QueueEvents } from "bullmq";

export const queueName = "file-processing";

export const connectionOptions = {
  host: process.env.REDIS_HOST || "redis",
  port: Number(process.env.REDIS_PORT || 6379),
};

export const fileQueue = new Queue(queueName, {
  connection: connectionOptions,
});

export const fileQueueEvents = new QueueEvents(queueName, {
  connection: connectionOptions,
});
