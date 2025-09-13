import { createClient } from 'redis';

export const redisPub = createClient({ url: process.env.REDIS_URL });
export const redisSub = createClient({ url: process.env.REDIS_URL });
export const redisChatHistory = createClient({ url: process.env.REDIS_URL });

/**
 * Establishes connections for all exported Redis clients.
 *
 * Connects redisPub, redisSub, and redisChatHistory concurrently. The returned promise
 * resolves when all connections succeed and rejects if any connection fails. On success
 * the function logs "Redis connected".
 */
export async function connectRedis() {
  await Promise.all([
    redisPub.connect(),
    redisSub.connect(),
    redisChatHistory.connect(),
  ]);
  console.log('Redis connected');
}
