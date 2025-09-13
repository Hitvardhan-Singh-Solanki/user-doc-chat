import * as fs from "fs";
import * as grpc from "@grpc/grpc-js";
import { SanitizerClient } from "../../proto/sanitizer_grpc_pb";
import { SanitizeRequest, SanitizeResponse } from "../../proto/sanitizer_pb";

const GRPC_HOST = process.env.SANITIZER_HOST || "python_apis:50051";
const REQUEST_TIMEOUT_MS = parseInt(
  process.env.SANITIZER_TIMEOUT || "10000",
  10
);

let sanitizerClient: SanitizerClient | null = null;

/**
 * Returns a singleton gRPC client for SanitizerService.
 */
function getSanitizerClient(): SanitizerClient {
  if (!sanitizerClient) {
    sanitizerClient = new SanitizerClient(
      GRPC_HOST,
      grpc.credentials.createInsecure()
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
  fileType: string
): Promise<string> {
  const client = getSanitizerClient();
  const fileData = fs.readFileSync(filePath);

  const request = new SanitizeRequest();
  request.setDocumentData(fileData);
  request.setDocumentType(fileType);

  const deadline = new Date();
  deadline.setMilliseconds(deadline.getMilliseconds() + REQUEST_TIMEOUT_MS);

  return new Promise<string>((resolve, reject) => {
    const metadata = new grpc.Metadata();
    // Change method call to sanitizeDocument and pass deadline
    client.sanitizeDocument(
      request,
      metadata,
      { deadline },
      (error, response: SanitizeResponse) => {
        if (error) {
          return reject(new Error(`gRPC call failed: ${error.message}`));
        }

        const markdownContent = response.getSanitizedContent();
        if (!markdownContent) {
          return reject(new Error("Sanitization response was empty."));
        }

        resolve(markdownContent);
      }
    );
  });
}
