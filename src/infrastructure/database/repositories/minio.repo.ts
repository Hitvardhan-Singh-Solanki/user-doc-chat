import { Client } from 'minio';
import { config as appConfig } from '@config';
import { secretsManager } from '@secrets';

let minioClient: Client | null = null;

/**
 * Get MinIO client instance (lazy initialization)
 */
export function getMinioClient(): Client {
  if (!minioClient) {
    minioClient = createMinioClient();
  }
  return minioClient;
}

/**
 * Validates MinIO endpoint configuration
 */
function validateMinioEndpoint(): string {
  const endpoint = appConfig.MINIO_ENDPOINT;
  if (!endpoint || typeof endpoint !== 'string' || endpoint.trim() === '') {
    throw new Error('MINIO_ENDPOINT must be a non-empty string');
  }
  return endpoint.trim();
}

/**
 * Validates port number range
 */
function isValidPort(port: number): boolean {
  return port > 0 && port <= 65535 && Number.isInteger(port);
}

/**
 * Parses string port to number
 */
function parseStringPort(port: string): number {
  const parsedPort = parseInt(port, 10);
  if (isNaN(parsedPort) || !isValidPort(parsedPort)) {
    throw new Error(
      'MINIO_PORT must be a positive integer between 1 and 65535',
    );
  }
  return parsedPort;
}

/**
 * Validates numeric port
 */
function validateNumericPort(port: number): number {
  if (!isValidPort(port)) {
    throw new Error(
      'MINIO_PORT must be a positive integer between 1 and 65535',
    );
  }
  return port;
}

/**
 * Validates and coerces MinIO port configuration
 */
function validateMinioPort(): number {
  const port = appConfig.MINIO_PORT;
  
  if (typeof port === 'string') {
    return parseStringPort(port);
  } else if (typeof port === 'number') {
    return validateNumericPort(port);
  } else {
    throw new Error('MINIO_PORT must be a number or numeric string');
  }
}

/**
 * Validates and coerces MinIO SSL configuration
 */
function validateMinioSSL(): boolean {
  const useSSL = appConfig.MINIO_USE_SSL;

  if (typeof useSSL === 'string') {
    const lowerValue = useSSL.toLowerCase();
    if (lowerValue === 'true') {
      return true;
    } else if (lowerValue === 'false') {
      return false;
    } else {
      throw new Error(
        'MINIO_USE_SSL must be a boolean or string "true"/"false"',
      );
    }
  } else if (typeof useSSL === 'boolean') {
    return useSSL;
  } else {
    throw new Error('MINIO_USE_SSL must be a boolean or string "true"/"false"');
  }
}

/**
 * Validates MinIO credentials
 */
function validateMinioCredentials(): { accessKey: string; secretKey: string } {
  const credentials = secretsManager.getMinioCredentials();

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

  return credentials;
}

/**
 * Validates MinIO bucket name if provided
 */
function validateMinioBucket(): string | undefined {
  const bucketName = appConfig.MINIO_BUCKET_NAME;

  if (
    bucketName &&
    (typeof bucketName !== 'string' || bucketName.trim() === '')
  ) {
    throw new Error(
      'MINIO_BUCKET_NAME must be a non-empty string when provided',
    );
  }

  return bucketName?.trim();
}

/**
 * Creates MinIO client with configuration validation
 */
function createMinioClient(): Client {
  const endpoint = validateMinioEndpoint();
  const port = validateMinioPort();
  const useSSL = validateMinioSSL();
  const bucketName = validateMinioBucket();
  const credentials = validateMinioCredentials();

  const minioConfig = {
    endPoint: endpoint,
    port,
    useSSL,
    bucketName,
    accessKey: credentials.accessKey,
    secretKey: credentials.secretKey,
  };

  return new Client(minioConfig);
}
