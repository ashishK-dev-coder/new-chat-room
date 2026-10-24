import { Redis } from '@upstash/redis';

let redisInstance: Redis | null = null;
let hasCheckedRedis = false;

export function getRedisClient(): Redis | null {
  if (hasCheckedRedis) {
    return redisInstance;
  }

  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    process.env.REDIS_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN;

  if (url && token) {
    try {
      redisInstance = new Redis({ url, token });
      console.log('[Redis] Connected to Upstash Redis for global real-time synchronization.');
    } catch (err) {
      console.warn('[Redis] Failed to initialize Redis client, falling back to local memory:', err);
      redisInstance = null;
    }
  }

  hasCheckedRedis = true;
  return redisInstance;
}
