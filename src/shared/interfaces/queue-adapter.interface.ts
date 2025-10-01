import { Queue, QueueEvents, Job } from 'bullmq';

/**
 * Queue adapter interface for BullMQ operations
 */
export interface IQueueAdapter {
  enqueue<T>(queueName: string, jobName: string, data: T): Promise<Job<T>>;
  getJobStatus<T>(
    queueName: string,
    jobId: string,
  ): Promise<Job<T> | undefined>;
  getQueueEvents(queueName: string): QueueEvents;
  getQueue(queueName: string): Queue;
}
