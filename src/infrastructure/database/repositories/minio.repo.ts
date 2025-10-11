import { Client } from 'minio';
import { config as appConfig } from '@config';
import { secretsManager } from '@secrets';

/**
 * Validates and parses MinIO configuration from environment variables
 * @throws {Error} When required environment variables are missing or invalid
 */
function validateMinioConfig() {
  // Use centralized config
  const endpoint = appConfig.MINIO_ENDPOINT;
  const port = appConfig.MINIO_PORT;
  const useSSL = appConfig.MINIO_USE_SSL;
  const bucketName = appConfig.MINIO_BUCKET_NAME;

  // Validate endpoint
  if (!endpoint || typeof endpoint !== 'string' || endpoint.trim() === '') {
    throw new Error('MINIO_ENDPOINT must be a non-empty string');
  }

  // Validate and coerce port
  let validatedPort: number;
  if (typeof port === 'string') {
    const parsedPort = parseInt(port, 10);
    if (isNaN(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
      throw new Error(
        'MINIO_PORT must be a positive integer between 1 and 65535',
      );
    }
    validatedPort = parsedPort;
  } else if (typeof port === 'number') {
    if (port <= 0 || port > 65535 || !Number.isInteger(port)) {
      throw new Error(
        'MINIO_PORT must be a positive integer between 1 and 65535',
      );
    }
    validatedPort = port;
  } else {
    throw new Error('MINIO_PORT must be a number or numeric string');
  }

  // Validate and coerce useSSL
  let validatedUseSSL: boolean;
  if (typeof useSSL === 'string') {
    const lowerValue = (useSSL as string).toLowerCase();
    if (lowerValue === 'true') {
      validatedUseSSL = true;
    } else if (lowerValue === 'false') {
      validatedUseSSL = false;
    } else {
      throw new Error(
        'MINIO_USE_SSL must be a boolean or string "true"/"false"',
      );
    }
  } else if (typeof useSSL === 'boolean') {
    validatedUseSSL = useSSL;
  } else {
    throw new Error('MINIO_USE_SSL must be a boolean or string "true"/"false"');
  }

  // Validate bucket name if provided
  if (
    bucketName &&
    (typeof bucketName !== 'string' || bucketName.trim() === '')
  ) {
    throw new Error(
      'MINIO_BUCKET_NAME must be a non-empty string when provided',
    );
  }

  // Get credentials from secrets manager
  const credentials = secretsManager.getMinioCredentials();

  // Validate credentials
  if (
    !credentials.accessKey ||
    typeof credentials.accessKey !== 'string' ||
    credentials.accessKey.trim() === ''
  ) {
    throw new Error(
      'MinIO access key is required and must be a non-empty string',
    );
  }

  if (
    !credentials.secretKey ||
    typeof credentials.secretKey !== 'string' ||
    credentials.secretKey.trim() === ''
  ) {
    throw new Error(
      'MinIO secret key is required and must be a non-empty string',
    );
  }

  return {
    endPoint: endpoint.trim(),
    port: validatedPort,
    useSSL: validatedUseSSL,
    bucketName: bucketName?.trim(),
    accessKey: credentials.accessKey,
    secretKey: credentials.secretKey,
  };
}

let minioClient: Client | null = null;

function getMinioClient(): Client {
  if (!minioClient) {
    const minioConfig = validateMinioConfig();
    minioClient = new Client(minioConfig);
  }
  return minioClient;
}

export { getMinioClient as minioClient };
