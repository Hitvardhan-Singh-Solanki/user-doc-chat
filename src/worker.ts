import { startWorker } from "./services/process-file.service";

startWorker()
  .then(() => console.log("Worker started and waiting for jobs..."))
  .catch((err) => {
    console.error("Worker failed:", err);
    process.exitCode = 1;
  });
