import { fileQueueName, queueAdapter } from '@queue/providers/bullmq.provider';
import { logger } from '@config/logger.config';
import type { FileJob } from '@shared/types';

export class FileQueueService {
  private readonly log = logger.child({ component: 'FileQueueService' });

  async enqueueFileProcessing(
    fileJob: FileJob & { key: string },
  ): Promise<void> {
    try {
      await queueAdapter.enqueue(fileQueueName, 'process-file', fileJob);
      this.log.debug(
        { fileId: fileJob.fileId, userId: fileJob.userId },
        'File processing job enqueued',
      );
    } catch (error) {
      this.log.error(
        { error, fileId: fileJob.fileId },
        'Failed to enqueue file processing job',
      );
      throw error;
    }
  }

  async getJobStatus(jobId: string): Promise<unknown> {
    try {
      const job = await queueAdapter.getJobStatus(fileQueueName, jobId);
      return job;
    } catch (error) {
      this.log.error({ error, jobId }, 'Failed to get job status');
      throw error;
    }
  }
}
