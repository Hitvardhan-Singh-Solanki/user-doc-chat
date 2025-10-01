import { promises as fs } from 'fs';
import * as grpc from '@grpc/grpc-js';
import { sanitizer } from '../../../../infrastructure/external-services/grpc/proto/sanitizer';

// Messages
const { SanitizeRequest } = sanitizer;

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

// TLS Configuration
const {
  NODE_ENV,
  SANITIZER_TLS_ENABLED,
  SANITIZER_TLS_CA_PATH,
  SANITIZER_TLS_CERT_PATH,
  SANITIZER_TLS_KEY_PATH,
} = process.env;

/**
 * Creates appropriate gRPC credentials based on environment configuration.
 * Uses secure TLS credentials for production or when explicitly enabled,
 * falls back to insecure credentials for development.
 */
async function createGrpcCredentials(): Promise<grpc.ChannelCredentials> {
  const isDevelopment = NODE_ENV !== 'production';
  const tlsEnabled = SANITIZER_TLS_ENABLED === 'true';

  // Use insecure credentials for development unless explicitly enabled
  if (isDevelopment && !tlsEnabled) {
    return grpc.credentials.createInsecure();
  }

  // For production or when TLS is explicitly enabled, use secure credentials
  try {
    let rootCerts: Buffer | null = null;
    let privateKey: Buffer | null = null;
    let certChain: Buffer | null = null;

    // Load root CA certificate if provided
    if (SANITIZER_TLS_CA_PATH) {
      rootCerts = await fs.readFile(SANITIZER_TLS_CA_PATH);
    }

    // Load client certificate and key for mTLS if provided
    if (SANITIZER_TLS_CERT_PATH && SANITIZER_TLS_KEY_PATH) {
      certChain = await fs.readFile(SANITIZER_TLS_CERT_PATH);
      privateKey = await fs.readFile(SANITIZER_TLS_KEY_PATH);
    }

    return grpc.credentials.createSsl(rootCerts, privateKey, certChain);
  } catch (error) {
    throw new Error(
      `Failed to create secure gRPC credentials: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
        'Please check TLS certificate paths and permissions.',
    );
  }
}

let sanitizerClient: SanitizerServiceClientType | null = null;
let credentialsPromise: Promise<grpc.ChannelCredentials> | null = null;

/**
 * Returns a singleton gRPC client for SanitizerService.
 * Creates the client with appropriate credentials based on environment configuration.
 */
async function getSanitizerClient(): Promise<SanitizerServiceClientType> {
  if (!sanitizerClient) {
    // Ensure credentials are created only once
    if (!credentialsPromise) {
      credentialsPromise = createGrpcCredentials();
    }

    const credentials = await credentialsPromise;
    sanitizerClient = new sanitizer.SanitizerServiceClient(
      GRPC_HOST,
      credentials,
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
  const client = await getSanitizerClient();

  let fileData: Buffer;
  try {
    fileData = await fs.readFile(filePath);
  } catch (error) {
    throw new Error(
      `Failed to read file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

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
