import { createClient } from 'redis';
import { logger } from '@config/logger.config';
import { config } from '@config';

/**
 * Builds Redis connection URL from configuration.
 *
 * Priority:
 * 1. Use REDIS_URL if provided (full connection string)
 * 2. Build URL from individual components with proper encoding
 *
 * Features:
 * - Supports TLS (rediss://) when REDIS_TLS is true
 * - Properly encodes credentials (username:password)
 * - Includes database index and query parameters
 * - Handles special characters in passwords
 */
function buildRedisUrl(): string {
  // If full URL is provided, use it directly
  if (config.REDIS_URL) {
    logger.info('Using provided REDIS_URL for Redis connection');
    return config.REDIS_URL;
  }

  // Handle Unix socket connection
  if (config.REDIS_SOCKET) {
    const scheme = config.REDIS_TLS ? 'rediss' : 'redis';
    let auth = '';

    // Handle credentials for socket connections
    if (config.REDIS_USERNAME || config.REDIS_PASSWORD) {
      const username = config.REDIS_USERNAME
        ? encodeURIComponent(config.REDIS_USERNAME)
        : '';
      const password = config.REDIS_PASSWORD
        ? encodeURIComponent(config.REDIS_PASSWORD)
        : '';

      if (username && password) {
        auth = `${username}:${password}@`;
      } else if (password) {
        auth = `${password}@`;
      } else if (username) {
        auth = `${username}@`;
      }
    }

    // Build query parameters for socket connections
    const queryParams: string[] = [];
    if (config.REDIS_DB !== 0) {
      queryParams.push(`db=${config.REDIS_DB}`);
    }

    const queryString =
      queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
    const url = `${scheme}://${auth}${config.REDIS_SOCKET}${queryString}`;

    logger.info(
      {
        scheme,
        socket: config.REDIS_SOCKET,
        hasAuth: !!auth,
        hasQuery: queryParams.length > 0,
        db: config.REDIS_DB,
      },
      'Built Redis URL with Unix socket',
    );

    return url;
  }

  // Build URL from host/port components
  const scheme = config.REDIS_TLS ? 'rediss' : 'redis';
  const host = config.REDIS_HOST;
  const port = config.REDIS_PORT;

  // Handle credentials
  let auth = '';
  if (config.REDIS_USERNAME || config.REDIS_PASSWORD) {
    const username = config.REDIS_USERNAME
      ? encodeURIComponent(config.REDIS_USERNAME)
      : '';
    const password = config.REDIS_PASSWORD
      ? encodeURIComponent(config.REDIS_PASSWORD)
      : '';

    if (username && password) {
      auth = `${username}:${password}@`;
    } else if (password) {
      auth = `${password}@`;
    } else if (username) {
      auth = `${username}@`;
    }
  }

  // Build query parameters
  const queryParams: string[] = [];
  if (config.REDIS_DB !== 0) {
    queryParams.push(`db=${config.REDIS_DB}`);
  }

  const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
  const url = `${scheme}://${auth}${host}:${port}${queryString}`;

  logger.info(
    {
      scheme,
      host,
      port,
      hasAuth: !!auth,
      hasQuery: queryParams.length > 0,
      db: config.REDIS_DB,
    },
    'Built Redis URL from configuration components',
  );

  return url;
}

// Build Redis URL from config
const REDIS_URL = buildRedisUrl();

// Create Redis clients with error handling and observability
const redisPub = createClient({ url: REDIS_URL });
const redisSub = createClient({ url: REDIS_URL });
const redisChatHistory = createClient({ url: REDIS_URL });

// Add error event handlers for all clients
redisPub.on('error', (error) => {
  logger.error({ error, client: 'redisPub' }, 'Redis pub client error');
  // In production, you might want to implement reconnection logic here
  // For now, we'll let the application handle the error
});

redisSub.on('error', (error) => {
  logger.error({ error, client: 'redisSub' }, 'Redis sub client error');
  // In production, you might want to implement reconnection logic here
  // For now, we'll let the application handle the error
});

redisChatHistory.on('error', (error) => {
  logger.error(
    { error, client: 'redisChatHistory' },
    'Redis chat history client error',
  );
  // In production, you might want to implement reconnection logic here
  // For now, we'll let the application handle the error
});

// Add ready/connect handlers for observability
redisPub.on('ready', () => {
  logger.info('Redis pub client ready');
});

redisSub.on('ready', () => {
  logger.info('Redis sub client ready');
});

redisChatHistory.on('ready', () => {
  logger.info('Redis chat history client ready');
});

redisPub.on('connect', () => {
  logger.info('Redis pub client connected');
});

redisSub.on('connect', () => {
  logger.info('Redis sub client connected');
});

redisChatHistory.on('connect', () => {
  logger.info('Redis chat history client connected');
});

// Export clients after handlers are attached
export { redisPub, redisSub, redisChatHistory };

/**
 * Establishes connections for all exported Redis clients.
 *
 * Connects redisPub, redisSub, and redisChatHistory concurrently. The returned promise
 * resolves when all connections succeed and rejects if any connection fails. On success
 * the function logs "Redis connected".
 */
export async function connectRedis() {
  try {
    await Promise.all([
      redisPub.connect(),
      redisSub.connect(),
      redisChatHistory.connect(),
    ]);
    logger.info('Redis connected');
  } catch (error) {
    logger.error(
      { error },
      'Failed to connect to Redis - one or more clients failed to connect',
    );
    throw error;
  }
}

/**
 * Disconnects all Redis clients gracefully.
 *
 * Calls quit() on all Redis clients concurrently. The returned promise
 * resolves when all disconnections succeed and rejects if any disconnection fails.
 */
export async function disconnectRedis() {
  try {
    await Promise.all([
      redisPub.quit(),
      redisSub.quit(),
      redisChatHistory.quit(),
    ]);
    logger.info('Redis disconnected successfully');
  } catch (error) {
    logger.error(
      { error },
      'Failed to disconnect from Redis - one or more clients failed to disconnect',
    );
    throw error;
  }
}
