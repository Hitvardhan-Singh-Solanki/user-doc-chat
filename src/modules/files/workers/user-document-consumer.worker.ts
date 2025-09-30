import { logger } from '../../../config/logger';
import { DeepResearchService } from '../../../modules/chat/services/deep-research.service';
import { EnrichmentService } from '../../../modules/chat/services/enrichment.service';
import { FetchHTMLService } from '../../../modules/chat/services/fetch.service';
import { LLMService } from '../../../modules/chat/services/llm.service';
import { PostgresService } from '../../../services/postgres.service';
import { FileWorkerService } from '../services/process-file.service';
import { VectorStoreService } from '../../../modules/vector/services/vector-store.service';

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
