import { Queue, QueueEvents } from "bullmq";

export const fileQueueName = "file-processing";
export const legalDocumentsQueueName = "legal-documents";

export const connectionOptions = {
  host: process.env.REDIS_HOST || "redis",
  port: Number(process.env.REDIS_PORT || 6379),
};

export const fileQueue = new Queue(fileQueueName, {
  connection: connectionOptions,
});

export const fileQueueEvents = new QueueEvents(fileQueueName, {
  connection: connectionOptions,
});

export const legalDocumentsQueue = new Queue(legalDocumentsQueueName, {
  connection: connectionOptions,
});
