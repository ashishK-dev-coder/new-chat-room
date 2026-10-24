import { Redis } from '@upstash/redis';

let redisInstance: Redis | null = null;
let hasCheckedRedis = false;
let isWritable = true;

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
      const client = new Redis({ url, token });
      redisInstance = client;
      hasCheckedRedis = true;

      // Asynchronously verify write permissions
      client
        .set('healthcheck:write', '1', { ex: 5 })
        .then(() => {
          isWritable = true;
          console.log('[Redis] Connected to Upstash Redis with full Read+Write access.');
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('NOPERM')) {
            isWritable = false;
            console.error(
              '\n[REDIS PERMISSION ALERT]\n' +
              'The UPSTASH_REDIS_REST_TOKEN in your environment is a READ-ONLY token.\n' +
              'Upstash rejected writes with NOPERM. To enable multi-lambda cross-sync,\n' +
              'please replace it with the standard Read-Write UPSTASH_REDIS_REST_TOKEN from https://console.upstash.com.\n'
            );
          } else {
            console.warn('[Redis] Write test warning:', msg);
          }
        });

      return redisInstance;
    } catch (err) {
      console.warn('[Redis] Failed to initialize Redis client, falling back to local memory:', err);
      redisInstance = null;
      isWritable = false;
    }
  }

  hasCheckedRedis = true;
  return redisInstance;
}

export function isRedisWritable(): boolean {
  return isWritable;
}
