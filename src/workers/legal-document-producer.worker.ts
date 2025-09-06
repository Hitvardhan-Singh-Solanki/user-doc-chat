import { LegalDocumentsService } from "../services/legal-documents.service";

(async function () {
  try {
    const legalDocsService = new LegalDocumentsService();

    legalDocsService.scheduleEnqueueCron("0 * * * *");

    console.log(
      "Cron job scheduled: enqueueing legal documents batch every hour"
    );
  } catch (err) {
    console.error("Failed to start legal documents cron:", err);
    process.exit(1);
  }
})();
