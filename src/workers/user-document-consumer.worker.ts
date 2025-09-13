import { DeepResearchService } from '../services/deep-research.service';
import { EnrichmentService } from '../services/enrichment.service';
import { FetchHTMLService } from '../services/fetch.service';
import { LLMService } from '../services/llm.service';
import { PostgresService } from '../services/postgres.service';
import { FileWorkerService } from '../services/process-file.service';
import { VectorStoreService } from '../services/vector-store.service';

(async function () {
  try {
    const fileWorkerService = initServices();
    await fileWorkerService.startWorker();

    console.log('Worker started and waiting for jobs...');
  } catch (err) {
    console.error('Error starting worker:', err);
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
  );

  return fileWorkerService;
}
