import { sseEmitter } from '../../../infrastructure/monitoring/notification.service';
import {
  queueAdapter,
  fileQueueName,
} from '../../../infrastructure/queue/providers/bullmq.provider';
import { logger } from '../../../config/logger.config';

const eventLogger = logger.child({ component: 'QueueEvents' });

const fileEvents = queueAdapter.getQueueEvents(fileQueueName);

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
    try {
      const success = await sseEmitter.send(userId, 'file-processed', {
        fileId,
        status: 'processed',
        error: null,
      });
      if (!success) {
        eventLogger.warn(
          { jobId, userId, fileId },
          'Message delivered locally only due to Redis publish failure.',
        );
      }
    } catch (err) {
      eventLogger.error(
        { jobId, userId, fileId, err: (err as Error).message },
        'Failed to send file-processed notification.',
      );
    }
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
    const job = await queueAdapter.getJobStatus(fileQueueName, jobId);
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
    try {
      const success = await sseEmitter.send(userId, 'file-failed', {
        fileId,
        status: 'failed',
        error: failedReason || 'Unknown error',
      });
      if (!success) {
        eventLogger.warn(
          { jobId, userId, fileId },
          'Message delivered locally only due to Redis publish failure.',
        );
      }
    } catch (err) {
      eventLogger.error(
        { jobId, userId, fileId, err: (err as Error).message },
        'Failed to send file-failed notification.',
      );
    }
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
    const job = await queueAdapter.getJobStatus(fileQueueName, jobId);
    if (!job) {
      eventLogger.warn({ jobId }, 'Job not found for progress update.');
      return;
    }
    const { userId, fileId } = (job.data || {}) as {
      userId?: string;
      fileId?: string;
    };
    if (!userId || !fileId) {
      eventLogger.warn(
        { jobId, jobData: job.data },
        'Missing userId or fileId in progress job data. Skipping notification.',
      );
      return;
    }

    eventLogger.debug(
      { jobId, userId, fileId, progress: data },
      'Notifying client of job progress.',
    );
    try {
      const success = await sseEmitter.send(userId, 'file-progress', {
        fileId,
        status: 'processing',
        progress: data || 0,
        error: null,
      });
      if (!success) {
        eventLogger.warn(
          { jobId, userId, fileId },
          'Message delivered locally only due to Redis publish failure.',
        );
      }
    } catch (err) {
      eventLogger.error(
        { jobId, userId, fileId, err: (err as Error).message },
        'Failed to send file-progress notification.',
      );
    }
  } catch (err) {
    eventLogger.error(
      { jobId, err: (err as Error).message, stack: (err as Error).stack },
      'Error in progress handler',
    );
  }
});
