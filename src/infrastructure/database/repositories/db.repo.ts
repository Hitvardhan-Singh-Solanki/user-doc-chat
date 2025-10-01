import { Pool } from 'pg';

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
  const isProduction = NODE_ENV === 'production';
  const isDevelopment = NODE_ENV === 'development' || NODE_ENV === 'test';

  // If SSL is explicitly disabled, return false
  if (PG_SSL === 'false') {
    return false;
  }

  // Production environment: Always enforce strict SSL
  if (isProduction) {
    const sslConfig: { rejectUnauthorized: boolean; ca?: string } = {
      rejectUnauthorized: true,
    };

    // Add custom CA if provided
    if (PG_SSL_CA) {
      sslConfig.ca = PG_SSL_CA;
    }

    return sslConfig;
  }

  // Development/Test environment: Allow relaxed settings only with explicit flag
  if (isDevelopment) {
    // Check for explicit development SSL bypass flag
    const allowRelaxedSSL =
      DEV_SSL_ALLOW === 'true' || PG_SSL_REJECT_UNAUTHORIZED === 'false';

    if (allowRelaxedSSL) {
      console.warn(
        '⚠️  WARNING: Using relaxed SSL settings in development. This is insecure for production!',
      );

      const sslConfig: { rejectUnauthorized: boolean; ca?: string } = {
        rejectUnauthorized: false,
      };

      // Add custom CA if provided
      if (PG_SSL_CA) {
        sslConfig.ca = PG_SSL_CA;
      }

      return sslConfig;
    }
  }

  // Default: Use strict SSL settings
  const sslConfig: { rejectUnauthorized: boolean; ca?: string } = {
    rejectUnauthorized: true,
  };

  // Add custom CA if provided
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
