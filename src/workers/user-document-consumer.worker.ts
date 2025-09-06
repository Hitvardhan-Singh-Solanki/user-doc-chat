import { PostgresService } from "../services/postgres.service";
import { FileWorkerService } from "../services/process-file.service";

(async function () {
  try {
    const dbAdapter = PostgresService.getInstance();
    const fileWorkerService = new FileWorkerService(dbAdapter);

    await fileWorkerService.startWorker();

    console.log("Worker started and waiting for jobs...");
  } catch (err) {
    console.error("Error starting worker:", err);
    process.exit(1);
  }
})();
