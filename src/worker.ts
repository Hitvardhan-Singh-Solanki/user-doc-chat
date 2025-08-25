import { startWorker } from "./services/process-file.service";

(async function () {
  try {
    await startWorker();
    console.log("Worker started and waiting for jobs...");
  } catch (err) {
    console.error("Error starting worker:", err);
    process.exit(1);
  }
})();
