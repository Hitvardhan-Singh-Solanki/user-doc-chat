import { Client } from 'minio';

/**
 * Validates and parses MinIO configuration from environment variables
 * @throws {Error} When required environment variables are missing or invalid
 */
function validateMinioConfig() {
  // Validate required environment variables
  const endpoint = process.env.MINIO_ENDPOINT;
  if (!endpoint || !endpoint.trim()) {
    throw new Error(
      'MINIO_ENDPOINT environment variable is required and must be non-empty',
    );
  }

  const accessKey = process.env.MINIO_ACCESS_KEY;
  if (!accessKey || !accessKey.trim()) {
    throw new Error(
      'MINIO_ACCESS_KEY environment variable is required and must be non-empty',
    );
  }

  const secretKey = process.env.MINIO_SECRET_KEY;
  if (!secretKey || !secretKey.trim()) {
    throw new Error(
      'MINIO_SECRET_KEY environment variable is required and must be non-empty',
    );
  }

  // Parse and validate port
  const portStr = process.env.MINIO_PORT || '9000';
  const port = Number(portStr);
  if (isNaN(port) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `MINIO_PORT must be a valid integer between 1 and 65535, got: ${portStr}`,
    );
  }

  // Parse SSL configuration
  const useSslStr = process.env.MINIO_USE_SSL;
  const isLocalEnv =
    process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'local';
  let useSSL: boolean;

  if (useSslStr === undefined || useSslStr === '') {
    // Default to true in non-local environments, false in local environments
    useSSL = !isLocalEnv;
  } else {
    // Parse explicit SSL setting
    const normalizedSslStr = useSslStr.toLowerCase().trim();
    useSSL = normalizedSslStr === 'true' || normalizedSslStr === '1';
  }

  return {
    endPoint: endpoint.trim(),
    port,
    useSSL,
    accessKey: accessKey.trim(),
    secretKey: secretKey.trim(),
  };
}

// Validate configuration and create client
const config = validateMinioConfig();
export const minioClient = new Client(config);
