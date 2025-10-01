import { createClient } from 'redis';
import { logger } from '../../../config/logger.config';

// Validate REDIS_URL environment variable before creating clients
const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  logger.error('REDIS_URL environment variable is required but not set');
  process.exit(1);
}

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
