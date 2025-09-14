import { QueueEvents, Job } from 'bullmq';
import { sseEmitter } from '../services/notify.service';
import {
  connectionOptions,
  fileQueue,
  fileQueueName,
} from '../repos/bullmq.repo';
import { logger } from '../config/logger';

const eventLogger = logger.child({ component: 'QueueEvents' });

const fileEvents = new QueueEvents(fileQueueName, {
  connection: connectionOptions,
});

fileEvents.on('completed', async ({ jobId, returnvalue }) => {
  eventLogger.info({ jobId }, 'Job completed. Sending notification...');
  try {
    const rv =
      typeof returnvalue === 'string' ? JSON.parse(returnvalue) : returnvalue;
    const { userId, fileId } = (rv || {}) as {
      userId?: string;
      fileId?: string;
    };
    if (!userId || !fileId) {
      eventLogger.warn(
        { jobId, returnvalue },
        'Missing userId or fileId in completed job return value. Skipping notification.',
      );
      return;
    }
    eventLogger.info(
      { jobId, userId, fileId },
      'Job completed successfully. Notifying client.',
    );
    sseEmitter.send(userId, 'file-processed', {
      fileId,
      status: 'processed',
      error: null,
    });
  } catch (err) {
    eventLogger.error(
      { jobId, err: (err as Error).message, stack: (err as Error).stack },
      'Error in completed handler',
    );
  }
});

fileEvents.on('failed', async ({ jobId, failedReason }) => {
  eventLogger.error(
    { jobId, failedReason },
    'Job failed. Attempting to notify client...',
  );
  try {
    const job = await fileQueue.getJob(jobId);
    if (!job) {
      eventLogger.warn({ jobId }, 'Job not found in failed handler');
      return;
    }
    const { userId, fileId } = (job.data || {}) as {
      userId?: string;
      fileId?: string;
    };
    if (!userId || !fileId) {
      eventLogger.warn(
        { jobId, jobData: job.data },
        'Missing userId or fileId in failed job data. Skipping notification.',
      );
      return;
    }
    eventLogger.info(
      { jobId, userId, fileId },
      'Notifying client of job failure.',
    );
    sseEmitter.send(userId, 'file-failed', {
      fileId,
      status: 'failed',
      error: failedReason || 'Unknown error',
    });
  } catch (err) {
    eventLogger.error(
      { jobId, err: (err as Error).message, stack: (err as Error).stack },
      'Error in failed handler',
    );
  }
});

fileEvents.on('progress', async ({ jobId, data }) => {
  eventLogger.debug({ jobId, progress: data }, 'Received job progress update.');
  try {
    const job = await fileQueue.getJob(jobId);
    if (!job) {
      eventLogger.warn({ jobId }, 'Job not found for progress update.');
      return;
    }
    const { userId, fileId } = job.data as { userId: string; fileId: string };

    eventLogger.debug(
      { jobId, userId, fileId, progress: data },
      'Notifying client of job progress.',
    );
    sseEmitter.send(userId, 'file-progress', {
      fileId,
      status: 'processing',
      progress: data || 0,
      error: null,
    });
  } catch (err) {
    eventLogger.error(
      { jobId, err: (err as Error).message, stack: (err as Error).stack },
      'Error in progress handler',
    );
  }
});
