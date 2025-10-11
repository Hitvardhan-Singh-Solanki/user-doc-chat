import 'dotenv/config';
import { Job, Worker } from 'bullmq';
import { v4 as uuid } from 'uuid';
import { downloadFile } from '@storage/providers/minio.provider';
import { VectorStoreService } from '@vector/services/vector-store.service';
import { FileJob, Vector } from '@shared/types';
import { sanitizeFile } from '@utils/sanitize-file';
import {
  connectionOptions,
  fileQueueName,
} from '@queue/providers/bullmq.provider';
import { IDBStore } from '@interfaces/db-store.interface';
import { LLMService } from '@chat/services/llm.service';
import { EnrichmentService } from '@chat/services/enrichment.service';
import { logger } from '@config/logger.config';
import { config } from '@config';
import retry from 'async-retry';
import { Logger } from 'pino';

export class FileWorkerService {
  private db: IDBStore;
  private worker?: Worker;
  private vectorStore: VectorStoreService;
  private llmService: LLMService;
  private enrichmentService: EnrichmentService;

  constructor(
    dbStore: IDBStore,
    llmService: LLMService,
    enrichmentService: EnrichmentService,
    vectorStore: VectorStoreService,
  ) {
    this.db = dbStore;
    this.llmService = llmService;
    this.enrichmentService = enrichmentService;
    this.vectorStore = vectorStore;
  }

  public async startWorker() {
    this.worker = new Worker(fileQueueName, this.processJob.bind(this), {
      connection: connectionOptions,
      concurrency: 5,
    });

    this.worker.on('failed', (job, err) =>
      logger.error(
        { jobId: job?.id, jobName: job?.name, err: err.message },
        'Job failed',
      ),
    );
    this.worker.on('error', (err) =>
      logger.error({ err: err.message }, 'Worker error'),
    );
    logger.info('File processing worker started.');
  }

  /** Stop the BullMQ worker gracefully */
  public async stopWorker(): Promise<void> {
    if (!this.worker) {
      logger.info('Worker is not running, nothing to stop');
      return;
    }

    logger.info('Stopping file processing worker...');

    try {
      // Close the worker gracefully
      await this.worker.close();
      this.worker = undefined;
      logger.info('File processing worker stopped successfully');
    } catch (error) {
      logger.error({ error }, 'Error stopping worker');
      throw error;
    }
  }

  /** Main job processor */
  private async processJob(job: Job) {
    const jobLogger = logger.child({
      jobId: job.id,
      jobName: job.name,
      fileId: job.data.fileId,
      userId: job.data.userId,
      correlationId: job.data.correlationId,
    });

    const payload = this.validateJobPayload(job.data as FileJob, jobLogger);
    jobLogger.info('Starting file processing job');

    try {
      await this.markFileProcessing(payload.fileId, jobLogger);
      await job.updateProgress(10);

      const text = await this.downloadAndSanitize(payload, jobLogger);
      await job.updateProgress(40);
      jobLogger.info({ sanitizedTextLength: text.length }, 'File sanitized');

      const chunks = this.llmService.chunkText(
        text,
        config.CHUNK_SIZE,
        config.CHUNK_OVERLAP,
      );
      jobLogger.info({ chunkCount: chunks.length }, 'Document chunked');

      await this.processChunksInBatches(chunks, payload, job, jobLogger);
      await this.markFileProcessed(payload.fileId, jobLogger);
      
      jobLogger.info('File processing job completed successfully');
      await job.updateProgress(100);

      return { userId: payload.userId, fileId: payload.fileId };
    } catch (error) {
      jobLogger.error(
        { error: (error as Error).message, stack: (error as Error).stack },
        'An error occurred during job processing',
      );
      await this.markFileFailed(payload.fileId, error as Error, jobLogger);
      throw error;
    }
  }

  private validateJobPayload(payload: FileJob, jobLogger: Logger): FileJob {
    if (!payload?.fileId || !payload?.userId || !payload?.key) {
      jobLogger.error('Invalid job data received');
      throw new Error('Invalid job data');
    }
    return payload;
  }

  private async processChunksInBatches(
    chunks: string[],
    payload: FileJob,
    job: Job,
    jobLogger: Logger,
  ) {
    const batch: Vector[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await this.getEmbeddingWithRetry(chunks[i], jobLogger);
      const vector = this.createVector(payload, chunks[i], uuid(), embedding, {
        type: 'full-document',
      });
      
      batch.push(vector);

      if (batch.length >= 50) {
        await this.upsertBatchWithRetry(batch.splice(0), jobLogger);
      }

      const progress = 40 + Math.floor(((i + 1) / chunks.length) * 50);
      await job.updateProgress(progress);
      jobLogger.debug({ progress }, 'Processing chunk');
    }

    if (batch.length) {
      await this.upsertBatchWithRetry(batch, jobLogger);
    }
  }

  private async getEmbeddingWithRetry(text: string, jobLogger: Logger): Promise<number[]> {
    return await retry(
      () => this.llmService.getEmbedding(text),
      {
        retries: 3,
        factor: 2,
        onRetry: (error, attempt) => {
          jobLogger.warn(
            { attempt, error: (error as Error).message },
            'Embedding failed, retrying...',
          );
        },
      },
    );
  }

  private async upsertBatchWithRetry(batch: Vector[], jobLogger: Logger) {
    await retry(() => this.vectorStore.upsertVectors(batch), {
      retries: 3,
      factor: 2,
      onRetry: (error, attempt) => {
        jobLogger.warn(
          { attempt, error: (error as Error).message },
          'Vector upsert failed, retrying...',
        );
      },
    });
  }

  // ------------------ Private helpers ------------------

  private async markFileProcessing(fileId: string, logger: Logger) {
    logger.info('Marking file status as "processing" in DB');
    await this.db.query(
      `UPDATE user_files SET status=$1, processing_started_at=NOW() WHERE id=$2`,
      ['processing', fileId],
    );
  }

  private async markFileProcessed(fileId: string, logger: Logger) {
    logger.info('Marking file status as "processed" in DB');
    await this.db.query(
      `UPDATE user_files SET status=$1, processing_finished_at=NOW() WHERE id=$2`,
      ['processed', fileId],
    );
  }

  private async markFileFailed(fileId: string, error: Error, logger: Logger) {
    logger.error('Marking file status as "failed" in DB');
    await this.db.query(
      `UPDATE user_files SET error_message=$1, status=$2, processing_finished_at=NOW() WHERE id=$3`,
      [error.message, 'failed', fileId],
    );
  }

  /** Step 1: Download and sanitize */
  private async downloadAndSanitize(
    payload: FileJob,
    logger: Logger,
  ): Promise<string> {
    const fileBuffer = await retry(() => downloadFile(payload.key), {
      retries: 5,
      factor: 2,
      onRetry: (error, attempt) => {
        logger.warn(
          { attempt, error: (error as Error).message },
          'File download failed, retrying...',
        );
      },
    });

    const sanitizedText = await sanitizeFile(fileBuffer);
    return sanitizedText;
  }

  /** Utility: Create vector with metadata */
  private createVector(
    payload: FileJob,
    text: string,
    id: string,
    embedding: number[],
    extraMeta: Record<string, unknown> = {},
  ): Vector {
    return {
      id: `${payload.fileId}-${id}`,
      values: embedding,
      metadata: {
        fileId: payload.fileId,
        userId: payload.userId,
        text,
        ...extraMeta,
        createdAt: new Date().toISOString(),
      },
    };
  }
}
