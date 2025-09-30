import { logger } from '../../../config/logger.config';
import { DeepResearchService } from '../../../domains/chat/services/deep-research.service';
import { EnrichmentService } from '../../../domains/chat/services/enrichment.service';
import { FetchHTMLService } from '../../../domains/chat/services/fetch.service';
import { LLMService } from '../../../domains/chat/services/llm.service';
import { PostgresService } from '../../../infrastructure/database/repositories/postgres.repository';
import { FileWorkerService } from '../services/process-file.service';
import { VectorStoreService } from '../../../domains/vector/services/vector-store.service';

(async function () {
  try {
    const fileWorkerService = initServices();
    await fileWorkerService.startWorker();

    logger.info('Worker started and waiting for jobs...');
  } catch (err) {
    logger.error({ error: err }, 'Error starting worker:');
    process.exit(1);
  }
})();

function initServices(): FileWorkerService {
  const dbAdapter = PostgresService.getInstance();
  const llmService = new LLMService();

  const fetchService = new FetchHTMLService();
  const deepResearchService = new DeepResearchService(llmService);

  const vectorStore = new VectorStoreService(llmService, 'pinecone');

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
