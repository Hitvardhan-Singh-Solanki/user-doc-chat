import { logger } from './logger.config';
import { Secrets } from '@shared/types/secrets.types';

/**
 * Secrets management module
 *
 * This module handles all sensitive configuration values separately from
 * the main config to prevent accidental exposure in logs or error messages.
 *
 * Best practices:
 * - Never log secret values
 * - Use environment variables or secret management services
 * - Implement secret rotation capabilities
 * - Audit secret access
 */

class SecretsManager {
  private secrets: Secrets | null = null;
  private initialized: boolean = false;
  private readonly log = logger.child({ component: 'SecretsManager' });

  /**
   * Initialize secrets from environment variables
   * Call this once at application startup
   * Safe to call multiple times (idempotent)
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      this.log.debug('Secrets already initialized, skipping');
      return;
    }

    try {
      this.secrets = {
        // JWT
        jwtSecret: this.getRequiredSecret(
          'JWT_SECRET',
          'JWT secret is required for authentication',
        ),

        // AI/LLM
        huggingfaceToken: this.getRequiredSecret(
          'HUGGINGFACE_HUB_TOKEN',
          'HuggingFace token is required for AI services',
        ),

        // Vector Store
        pineconeApiKey: this.getRequiredSecret(
          'PINECONE_API_KEY',
          'Pinecone API key is required for vector storage',
        ),

        // MinIO/S3
        minioAccessKey: this.getRequiredSecret(
          'MINIO_ACCESS_KEY',
          'MinIO access key is required for file storage',
        ),
        minioSecretKey: this.getRequiredSecret(
          'MINIO_SECRET_KEY',
          'MinIO secret key is required for file storage',
        ),

        // Database
        postgresPassword: this.getRequiredSecret(
          'POSTGRES_PASSWORD',
          'PostgreSQL password is required for database connection',
        ),
        redisPassword: process.env.REDIS_PASSWORD, // Optional

        // Sanitizer Service
        sanitizerHost: process.env.SANITIZER_HOST, // Optional
        sanitizerTimeout: process.env.SANITIZER_TIMEOUT
          ? parseInt(process.env.SANITIZER_TIMEOUT, 10)
          : undefined, // Optional
      };

      this.initialized = true;
      this.log.info('Secrets initialized successfully');
    } catch (error) {
      this.log.fatal({ error }, 'Failed to initialize secrets');
      throw new Error('Secrets initialization failed');
    }
  }

  /**
   * Get a required secret value
   */
  private getRequiredSecret(envVar: string, errorMessage: string): string {
    const value = process.env[envVar];
    if (!value || value.trim() === '') {
      this.log.fatal({ envVar }, errorMessage);
      throw new Error(`${envVar} is required but not set`);
    }
    return value;
  }

  /**
   * Get JWT secret
   */
  public getJwtSecret(): string {
    this.ensureInitialized();
    return this.secrets!.jwtSecret;
  }

  /**
   * Get HuggingFace token
   */
  public getHuggingfaceToken(): string {
    this.ensureInitialized();
    return this.secrets!.huggingfaceToken;
  }

  /**
   * Get Pinecone API key
   */
  public getPineconeApiKey(): string {
    this.ensureInitialized();
    return this.secrets!.pineconeApiKey;
  }

  /**
   * Get MinIO credentials
   */
  public getMinioCredentials(): { accessKey: string; secretKey: string } {
    this.ensureInitialized();
    return {
      accessKey: this.secrets!.minioAccessKey,
      secretKey: this.secrets!.minioSecretKey,
    };
  }

  /**
   * Get database passwords
   */
  public getDatabasePasswords(): { postgres: string; redis?: string } {
    this.ensureInitialized();
    return {
      postgres: this.secrets!.postgresPassword,
      redis: this.secrets!.redisPassword,
    };
  }

  /**
   * Get sanitizer service configuration
   */
  public getSanitizerConfig(): { host?: string; timeout?: number } {
    this.ensureInitialized();
    return {
      host: this.secrets!.sanitizerHost,
      timeout: this.secrets!.sanitizerTimeout,
    };
  }

  /**
   * Ensure secrets are initialized, initialize if needed
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      // For synchronous access, we need to throw an error if not initialized
      // The caller should have called initialize() first
      throw new Error('Secrets not initialized. Call initialize() first.');
    }
  }

  /**
   * Rotate a secret (for future implementation)
   * This would integrate with secret management services like AWS Secrets Manager
   */
  public async rotateSecret(secretName: string): Promise<void> {
    this.log.info({ secretName }, 'Secret rotation requested');
    // TODO: Implement secret rotation with your secret management service
    // Example: AWS Secrets Manager, HashiCorp Vault, etc.
    throw new Error('Secret rotation not implemented yet');
  }

  /**
   * Audit secret access (for security monitoring)
   */
  private auditSecretAccess(secretName: string, action: string): void {
    this.log.info(
      { secretName, action, timestamp: new Date().toISOString() },
      'Secret access audited',
    );
  }
}

// Export singleton instance
export const secretsManager = new SecretsManager();
