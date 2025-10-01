import { Queue, QueueEvents, Job } from 'bullmq';
import {
  fileQueue,
  fileQueueEvents,
  legalDocumentsQueue,
  connectionOptions,
  fileQueueName,
  legalDocumentsQueueName,
} from '../../database/repositories/bullmq.repo';
import { IQueueAdapter } from '../../../shared/interfaces/queue-adapter.interface';

/**
 * BullMQ Queue Adapter
 * Provides a clean interface for queue operations while hiding repository implementation details
 */
export class BullMQAdapter implements IQueueAdapter {
  private queues: Map<string, Queue> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();

  constructor() {
    // Initialize queues
    this.queues.set(fileQueueName, fileQueue);
    this.queues.set(legalDocumentsQueueName, legalDocumentsQueue);

    // Initialize queue events
    this.queueEvents.set(fileQueueName, fileQueueEvents);
  }

  /**
   * Enqueue a job to the specified queue
   */
  async enqueue<T>(
    queueName: string,
    jobName: string,
    data: T,
  ): Promise<Job<T>> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }
    return queue.add(jobName, data);
  }

  /**
   * Get job status by ID from the specified queue
   */
  async getJobStatus<T>(
    queueName: string,
    jobId: string,
  ): Promise<Job<T> | undefined> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }
    return queue.getJob(jobId);
  }

  /**
   * Get queue events for the specified queue
   */
  getQueueEvents(queueName: string): QueueEvents {
    const events = this.queueEvents.get(queueName);
    if (!events) {
      throw new Error(`Queue events for '${queueName}' not found`);
    }
    return events;
  }

  /**
   * Get the queue instance for the specified queue name
   */
  getQueue(queueName: string): Queue {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue '${queueName}' not found`);
    }
    return queue;
  }
}

// Export singleton instance
export const queueAdapter = new BullMQAdapter();

// Export queue names for consumers
export { fileQueueName, legalDocumentsQueueName };

// Export connection options for workers (needed for Worker initialization)
export { connectionOptions };
