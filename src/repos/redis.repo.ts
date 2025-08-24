import { createClient } from "redis";

export const redisPub = createClient({ url: process.env.REDIS_URL });
export const redisSub = createClient({ url: process.env.REDIS_URL });

export async function connectRedis() {
  await redisPub.connect();
  await redisSub.connect();
  console.log("Redis connected for Pub/Sub");
}
