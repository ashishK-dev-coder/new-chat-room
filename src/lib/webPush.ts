import webpush from 'web-push';
import { getRedisClient, isRedisWritable, markRedisNonWritable } from '@/lib/redis';

export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  'BJoR3CU5b1ewC5Wl_6bivArwSQW3hI_WweyJfqYHEU-3olmFPExu6sHgxOhhsc6GucQ_5NmHa4w30ueVW4Rvdk0';

export const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  'WxIguBwg-eFiYM8UZ4sTc0sQp28BXTHMrcX9xh8zSh8';

export const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT ||
  'mailto:admin@local-document-sync.internal';

try {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} catch (e) {
  console.warn('VAPID initialization notice:', e);
}

// In-memory subscription cache
const inMemorySubscriptions = new Map<string, webpush.PushSubscription>();

export async function savePushSubscription(
  roomId: string,
  authorId: string,
  subscription: webpush.PushSubscription
): Promise<void> {
  const key = `${roomId}:${authorId}`;
  inMemorySubscriptions.set(key, subscription);

  const redis = getRedisClient();
  if (redis && isRedisWritable()) {
    try {
      await redis.set(`room:${roomId}:push:${authorId}`, JSON.stringify(subscription), {
        ex: 30 * 24 * 3600, // 30 days
      });
    } catch (err) {
      markRedisNonWritable(err);
    }
  }
}

export async function getPushSubscription(
  roomId: string,
  authorId: string
): Promise<webpush.PushSubscription | null> {
  const key = `${roomId}:${authorId}`;
  if (inMemorySubscriptions.has(key)) {
    return inMemorySubscriptions.get(key) || null;
  }

  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get<string | object>(`room:${roomId}:push:${authorId}`);
      if (raw) {
        const sub = (typeof raw === 'string' ? JSON.parse(raw) : raw) as webpush.PushSubscription;
        inMemorySubscriptions.set(key, sub);
        return sub;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

export async function sendPushToAuthor(
  roomId: string,
  authorId: string,
  payload: { title: string; body: string }
): Promise<boolean> {
  try {
    const sub = await getPushSubscription(roomId, authorId);
    if (!sub || !sub.endpoint) return false;

    await webpush.sendNotification(sub, JSON.stringify(payload), {
      TTL: 86400, // 24 hours delivery window (ensures FCM never drops while device is locked/sleeping)
      urgency: 'high', // Wake up Android from deep sleep/Doze mode
    });
    return true;
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      // Expired or unsubscribed
      inMemorySubscriptions.delete(`${roomId}:${authorId}`);
      const redis = getRedisClient();
      if (redis && isRedisWritable()) {
        redis.del(`room:${roomId}:push:${authorId}`).catch(markRedisNonWritable);
      }
    }
    return false;
  }
}
