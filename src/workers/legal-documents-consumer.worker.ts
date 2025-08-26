import { LegalDocumentsService } from "../services/legal-documents.service";

(async function () {
  try {
    const legalDocsService = new LegalDocumentsService();

    await legalDocsService.startWorker();

    console.log("Legal documents worker started and waiting for jobs...");
  } catch (err) {
    console.error("Error starting legal documents worker:", err);
    process.exit(1);
  }
})();
