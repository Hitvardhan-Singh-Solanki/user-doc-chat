import * as fs from 'fs';
import * as grpc from '@grpc/grpc-js';
import { sanitizer } from '../../../../infrastructure/external-services/grpc/proto/sanitizer';

// Messages
const { SanitizeRequest, SanitizeResponse } = sanitizer;

// Get the correct type for the client
type SanitizerServiceClientType = InstanceType<
  typeof sanitizer.SanitizerServiceClient
>;

const GRPC_HOST = process.env.SANITIZER_HOST || 'python_apis:50051';
const REQUEST_TIMEOUT_MS = (() => {
  const raw = process.env.SANITIZER_TIMEOUT;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 10000;
})();

let sanitizerClient: SanitizerServiceClientType | null = null;

/**
 * Returns a singleton gRPC client for SanitizerService.
 */
function getSanitizerClient(): SanitizerServiceClientType {
  if (!sanitizerClient) {
    sanitizerClient = new sanitizer.SanitizerServiceClient(
      GRPC_HOST,
      grpc.credentials.createInsecure(),
    );
  }
  return sanitizerClient;
}

/**
 * Sends a file to the gRPC service for sanitization.
 * @param filePath - The path to the file.
 * @param fileType - The MIME type of the file.
 */
export async function sanitizeFileGrpc(
  filePath: string,
  fileType: string,
): Promise<string> {
  const client = getSanitizerClient();
  const fileData = fs.readFileSync(filePath);

  const request = new SanitizeRequest();
  request.document_type = fileType;
  request.document_data = fileData;

  const deadline = new Date();
  deadline.setMilliseconds(deadline.getMilliseconds() + REQUEST_TIMEOUT_MS);

  return new Promise<string>((resolve, reject) => {
    const metadata = new grpc.Metadata();

    // Use the correct method name from generated code: SanitizeDocument
    client.SanitizeDocument(
      request,
      metadata,
      { deadline },
      (error, response) => {
        if (error) {
          return reject(new Error(`gRPC call failed: ${error.message}`));
        }

        const markdownContent = response?.sanitized_content;
        if (!markdownContent) {
          return reject(new Error('Sanitization response was empty.'));
        }

        resolve(markdownContent);
      },
    );
  });
}
