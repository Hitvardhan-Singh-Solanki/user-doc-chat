import { createClient } from 'redis';
import { logger } from '@config/logger.config';
import { config } from '@config';

/**
 * Builds Redis connection configuration from settings.
 *
 * Priority:
 * 1. Use REDIS_URL if provided (full connection string)
 * 2. Use Unix socket if REDIS_SOCKET is provided
 * 3. Build URL from host/port components
 *
 * Features:
 * - Supports TLS for both socket and TCP connections
 * - Properly handles credentials for all connection types
 * - Returns appropriate config for node-redis v4
 */
function buildRedisConfig(): string | object {
  // If full URL is provided, use it directly
  if (config.REDIS_URL) {
    logger.info('Using provided REDIS_URL for Redis connection');
    return config.REDIS_URL;
  }

  // Handle Unix socket connection
  if (config.REDIS_SOCKET) {
    const socketOptions: {
      socket: { path: string; tls?: boolean };
      database?: number;
      username?: string;
      password?: string;
    } = {
      socket: {
        path: config.REDIS_SOCKET,
      },
    };

    // Add TLS for socket if enabled
    if (config.REDIS_TLS) {
      socketOptions.socket.tls = true;
    }

    // Add database index if not default
    if (config.REDIS_DB !== null && config.REDIS_DB !== 0) {
      socketOptions.database = config.REDIS_DB;
    }

    // Add credentials if provided
    if (config.REDIS_USERNAME) {
      socketOptions.username = config.REDIS_USERNAME;
    }
    if (config.REDIS_PASSWORD) {
      socketOptions.password = config.REDIS_PASSWORD;
    }

    logger.info(
      {
        socketPath: config.REDIS_SOCKET,
        tls: config.REDIS_TLS,
        db: config.REDIS_DB,
        hasAuth: !!(config.REDIS_USERNAME || config.REDIS_PASSWORD),
      },
      'Built Redis socket connection options',
    );

    return socketOptions;
  }

  // Build URL from host/port components
  const scheme = config.REDIS_TLS ? 'rediss' : 'redis';

  // Validate Redis host configuration
  if (!config.REDIS_HOST || config.REDIS_HOST.trim() === '') {
    throw new Error(
      'REDIS_HOST environment variable is required and cannot be empty',
    );
  }

  // Validate Redis port configuration
  if (config.REDIS_PORT === undefined || config.REDIS_PORT === null) {
    throw new Error('REDIS_PORT environment variable is required');
  }

  const port = Number(config.REDIS_PORT);
  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new Error(
      `REDIS_PORT must be a valid port number (1-65535), got: ${config.REDIS_PORT}`,
    );
  }

  const host = config.REDIS_HOST.trim();

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
      auth = `:${password}@`;
    } else if (username) {
      auth = `${username}@`;
    }
  }

  // Build query parameters
  const queryParams: string[] = [];
  if (config.REDIS_DB != null && config.REDIS_DB !== 0) {
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

// Build Redis configuration from config
const REDIS_CONFIG = buildRedisConfig();

// Create Redis clients with error handling and observability
// Handle both URL strings and socket options for node-redis v4
const redisPub =
  typeof REDIS_CONFIG === 'string'
    ? createClient({ url: REDIS_CONFIG })
    : createClient(REDIS_CONFIG);
const redisSub =
  typeof REDIS_CONFIG === 'string'
    ? createClient({ url: REDIS_CONFIG })
    : createClient(REDIS_CONFIG);
const redisChatHistory =
  typeof REDIS_CONFIG === 'string'
    ? createClient({ url: REDIS_CONFIG })
    : createClient(REDIS_CONFIG);

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
