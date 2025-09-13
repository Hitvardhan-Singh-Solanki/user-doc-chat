import { QueueEvents } from 'bullmq';
import { sseEmitter } from '../services/notify.service';
import {
  connectionOptions,
  fileQueue,
  fileQueueName,
} from '../repos/bullmq.repo';

const fileEvents = new QueueEvents(fileQueueName, {
  connection: connectionOptions,
});

fileEvents.on('completed', async ({ jobId, returnvalue }) => {
  try {
    const rv =
      typeof returnvalue === 'string' ? JSON.parse(returnvalue) : returnvalue;
    const { userId, fileId } = (rv || {}) as {
      userId?: string;
      fileId?: string;
    };
    if (!userId || !fileId) return;
    sseEmitter.send(userId, 'file-processed', {
      fileId,
      status: 'processed',
      error: null,
    });
  } catch (err) {
    console.error(`QueueEvents.completed handler error for job ${jobId}`, err);
  }
});

fileEvents.on('failed', async ({ jobId, failedReason }) => {
  try {
    const job = await fileQueue.getJob(jobId);
    if (!job) {
      console.warn(`Job ${jobId} not found in failed handler`);
      return;
    }
    const { userId, fileId } = (job.data || {}) as {
      userId?: string;
      fileId?: string;
    };
    if (!userId || !fileId) return;
    sseEmitter.send(userId, 'file-failed', {
      fileId,
      status: 'failed',
      error: failedReason || 'Unknown error',
    });
  } catch (err) {
    console.error(`QueueEvents.failed handler error for job ${jobId}`, err);
  }
});

fileEvents.on('progress', async ({ jobId, data }) => {
  const job = await fileQueue.getJob(jobId);
  if (!job) return;

  const { userId, fileId } = job.data;

  sseEmitter.send(userId, 'file-progress', {
    fileId,
    status: 'processing',
    progress: data || 0,
    error: null,
  });
});
