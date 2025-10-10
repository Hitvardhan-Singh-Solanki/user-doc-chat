import { Client } from 'minio';
import { config as appConfig } from '../../../config/app.config';
import { secretsManager } from '../../../config/secrets.config';

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

  // Get credentials from secrets manager
  const credentials = secretsManager.getMinioCredentials();

  return {
    endPoint: endpoint,
    port,
    useSSL,
    accessKey: credentials.accessKey,
    secretKey: credentials.secretKey,
  };
}

// Validate configuration and create client
const minioConfig = validateMinioConfig();
export const minioClient = new Client(minioConfig);
