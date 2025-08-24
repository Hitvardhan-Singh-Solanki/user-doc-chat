import { QueueEvents } from "bullmq";
import { sseEmitter } from "../services/notify.service";
import { connectionOptions, fileQueue, queueName } from "../repos/bullmq.repo";

const fileEvents = new QueueEvents(queueName, {
  connection: connectionOptions,
});

fileEvents.on("completed", async ({ jobId, returnvalue }) => {
  const { userId, fileId } = returnvalue as unknown as {
    userId: string;
    fileId: string;
  };

  sseEmitter.send(userId, "file-processed", {
    fileId,
    status: "processed",
    error: null,
  });
});

fileEvents.on("failed", async ({ jobId, failedReason }) => {
  const job = await fileQueue.getJob(jobId);
  const { userId, fileId } = job.data;

  sseEmitter.send(userId, "file-failed", {
    fileId,
    status: "failed",
    error: failedReason,
  });
});

fileEvents.on("progress", async ({ jobId, data }) => {
  const job = await fileQueue.getJob(jobId);
  if (!job) return;

  const { userId, fileId } = job.data;

  sseEmitter.send(userId, "file-progress", {
    fileId,
    status: "processing",
    progress: data || 0,
    error: null,
  });
});
