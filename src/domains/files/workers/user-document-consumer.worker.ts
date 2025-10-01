import { logger } from '../../../config/logger.config';
import { DeepResearchService } from '../../../domains/chat/services/deep-research.service';
import { EnrichmentService } from '../../../domains/chat/services/enrichment.service';
import { FetchHTMLService } from '../../../domains/chat/services/fetch.service';
import { LLMService } from '../../../domains/chat/services/llm.service';
import { PostgresService } from '../../../infrastructure/database/repositories/postgres.repository';
import { FileWorkerService } from '../services/process-file.service';
import { VectorStoreService } from '../../../domains/vector/services/vector-store.service';
import { db } from '../../../infrastructure/database/repositories/db.repo';
import { getVectorStoreProviderWithLogging } from '../../../shared/utils';

// Global state for cleanup tracking
let fileWorkerService: FileWorkerService | null = null;
let isShuttingDown = false;
let cleanupTimeout: NodeJS.Timeout | null = null;

// Graceful shutdown configuration
const CLEANUP_TIMEOUT_MS = 30000; // 30 seconds
const FORCE_EXIT_TIMEOUT_MS = 5000; // 5 seconds after cleanup timeout

/**
 * Async cleanup function that safely stops the worker and closes all resources
 * Made idempotent to prevent double cleanup
 */
async function cleanup(): Promise<void> {
  if (isShuttingDown) {
    logger.info('Cleanup already in progress, skipping...');
    return;
  }

  isShuttingDown = true;
  logger.info('Starting graceful shutdown...');

  try {
    // Stop the BullMQ worker
    if (fileWorkerService) {
      logger.info('Stopping file worker service...');
      await fileWorkerService.stopWorker();
      fileWorkerService = null;
    }

    // Close database connection pool
    logger.info('Closing database connection pool...');
    await db.end();
    logger.info('Database connection pool closed');

    logger.info('Graceful shutdown completed successfully');
  } catch (error) {
    logger.error({ error }, 'Error during cleanup:');
    throw error;
  }
}

/**
 * Signal handler for graceful shutdown
 */
async function handleShutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Received shutdown signal');

  try {
    // Set up forced exit timeout as fallback
    cleanupTimeout = setTimeout(() => {
      logger.error('Cleanup timeout reached, forcing exit...');
      process.exit(1);
    }, CLEANUP_TIMEOUT_MS);

    await cleanup();

    // Clear the timeout since cleanup succeeded
    if (cleanupTimeout) {
      clearTimeout(cleanupTimeout);
      cleanupTimeout = null;
    }

    // Exit gracefully
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Cleanup failed, exiting with error');

    // Clear timeout and force exit after a short delay
    if (cleanupTimeout) {
      clearTimeout(cleanupTimeout);
    }

    setTimeout(() => {
      logger.error('Forcing exit after cleanup failure');
      process.exit(1);
    }, FORCE_EXIT_TIMEOUT_MS);
  }
}

// Register signal handlers
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', async (error) => {
  logger.error({ error }, 'Uncaught exception occurred');
  await handleShutdown('uncaughtException');
});

process.on('unhandledRejection', async (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled promise rejection occurred');
  await handleShutdown('unhandledRejection');
});

(async function () {
  try {
    fileWorkerService = initServices();
    await fileWorkerService.startWorker();

    logger.info('Worker started and waiting for jobs...');
  } catch (err) {
    logger.error({ error: err }, 'Error starting worker:');

    // Attempt cleanup before exiting on startup error
    try {
      await cleanup();
      process.exit(1);
    } catch (cleanupError) {
      logger.error(
        { error: cleanupError },
        'Cleanup failed during startup error handling',
      );
      process.exit(1);
    }
  }
})();

function initServices(): FileWorkerService {
  const dbAdapter = PostgresService.getInstance();
  const llmService = new LLMService();

  const fetchService = new FetchHTMLService();
  const deepResearchService = new DeepResearchService(llmService);

  // Get vector store provider from configuration
  const vectorStoreProvider = getVectorStoreProviderWithLogging();
  const vectorStore = new VectorStoreService(llmService, vectorStoreProvider);

  const enrichmentService = new EnrichmentService(
    llmService,
    vectorStore,
    fetchService,
    deepResearchService,
  );

  llmService.enrichmentService = enrichmentService;

  const fileWorkerService = new FileWorkerService(
    dbAdapter,
    llmService,
    enrichmentService,
    vectorStore,
  );

  return fileWorkerService;
}
