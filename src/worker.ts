import { startWorker } from "./services/process-file.service";
import { llmService } from "./services/llm.service";

(async function () {
  try {
    await llmService.init();
    console.log("LLM Service initialized successfully");
    await startWorker();
    console.log("Worker started and waiting for jobs...");
  } catch (err) {
    console.error("Error starting worker:", err);
    process.exit(1);
  }
})();
