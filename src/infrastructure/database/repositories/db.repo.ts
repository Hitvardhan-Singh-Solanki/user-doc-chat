import { Pool } from 'pg';
import { logger } from '../../../config/logger.config';

const {
  DATABASE_URL,
  NODE_ENV,
  PG_SSL,
  PG_SSL_REJECT_UNAUTHORIZED,
  PG_SSL_CA,
  DEV_SSL_ALLOW,
} = process.env;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

/**
 * Builds SSL configuration for PostgreSQL connection
 * Security rules:
 * - Production: Always enforce certificate validation (rejectUnauthorized: true)
 * - Development/Test: Allow relaxed settings only with explicit DEV_SSL_ALLOW flag
 * - Custom CA: Use PG_SSL_CA if provided
 */
function buildSSLConfig(): boolean | object {
  if (PG_SSL === 'false') {
    return false;
  }

  const isProduction = NODE_ENV === 'production';
  const isDevelopment = NODE_ENV === 'development' || NODE_ENV === 'test';

  if (isProduction) {
    return buildProductionSSLConfig();
  }

  if (isDevelopment) {
    return buildDevelopmentSSLConfig();
  }

  return buildDefaultSSLConfig();
}

function buildProductionSSLConfig(): object {
  const sslConfig: { rejectUnauthorized: boolean; ca?: string } = {
    rejectUnauthorized: true,
  };

  if (PG_SSL_CA) {
    sslConfig.ca = PG_SSL_CA;
  }

  return sslConfig;
}

function buildDevelopmentSSLConfig(): object {
  const allowRelaxedSSL =
    DEV_SSL_ALLOW === 'true' || PG_SSL_REJECT_UNAUTHORIZED === 'false';

  if (allowRelaxedSSL) {
    logger.warn(
      {
        environment: 'development',
        securityRisk: 'relaxed_ssl_settings',
        warning:
          'Using relaxed SSL settings in development. This is insecure for production!',
      },
      'Development SSL configuration warning',
    );

    const sslConfig: { rejectUnauthorized: boolean; ca?: string } = {
      rejectUnauthorized: false,
    };

    if (PG_SSL_CA) {
      sslConfig.ca = PG_SSL_CA;
    }

    return sslConfig;
  }

  return buildDefaultSSLConfig();
}

function buildDefaultSSLConfig(): object {
  const sslConfig: { rejectUnauthorized: boolean; ca?: string } = {
    rejectUnauthorized: true,
  };

  if (PG_SSL_CA) {
    sslConfig.ca = PG_SSL_CA;
  }

  return sslConfig;
}

// Validate environment variables
if (
  NODE_ENV === 'production' &&
  (PG_SSL_REJECT_UNAUTHORIZED === 'false' || DEV_SSL_ALLOW === 'true')
) {
  throw new Error(
    'SECURITY ERROR: Cannot use relaxed SSL settings in production environment',
  );
}

export const db = new Pool({
  connectionString: DATABASE_URL,
  ssl: buildSSLConfig(),
});
