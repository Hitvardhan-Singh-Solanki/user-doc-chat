import { createClient } from "redis";

export const redisPub = createClient({ url: process.env.REDIS_URL });
export const redisSub = createClient({ url: process.env.REDIS_URL });
export const redisChatHistory = createClient({ url: process.env.REDIS_URL });

export async function connectRedis() {
  await Promise.all([
    redisPub.connect(),
    redisSub.connect(),
    redisChatHistory.connect(),
  ]);
  console.log("Redis connected");
}
