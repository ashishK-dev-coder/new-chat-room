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

// Multi-device in-memory subscription cache: roomId:authorId -> Map<endpoint, PushSubscription>
const inMemorySubscriptions = new Map<string, Map<string, webpush.PushSubscription>>();

export async function savePushSubscription(
  roomId: string,
  authorId: string,
  subscription: webpush.PushSubscription
): Promise<void> {
  if (!subscription || !subscription.endpoint) return;

  const key = `${roomId}:${authorId}`;
  let authorSubs = inMemorySubscriptions.get(key);
  if (!authorSubs) {
    authorSubs = new Map<string, webpush.PushSubscription>();
    inMemorySubscriptions.set(key, authorSubs);
  }

  // Register device endpoint (cap at 6 devices per author to prevent memory bloat)
  authorSubs.set(subscription.endpoint, subscription);
  if (authorSubs.size > 6) {
    const oldest = authorSubs.keys().next().value;
    if (oldest) authorSubs.delete(oldest);
  }

  const redis = getRedisClient();
  if (redis && isRedisWritable()) {
    try {
      const subsList = Array.from(authorSubs.values());
      await redis.set(`room:${roomId}:push:${authorId}`, JSON.stringify(subsList), {
        ex: 30 * 24 * 3600, // 30 days
      });
    } catch (err) {
      markRedisNonWritable(err);
    }
  }
}

export async function getPushSubscriptions(
  roomId: string,
  authorId: string
): Promise<webpush.PushSubscription[]> {
  const key = `${roomId}:${authorId}`;
  let authorSubs = inMemorySubscriptions.get(key);

  if (!authorSubs || authorSubs.size === 0) {
    const redis = getRedisClient();
    if (redis) {
      try {
        const raw = await redis.get<string | object>(`room:${roomId}:push:${authorId}`);
        if (raw) {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          const list: webpush.PushSubscription[] = Array.isArray(parsed) ? parsed : [parsed];
          authorSubs = new Map<string, webpush.PushSubscription>();
          for (const s of list) {
            if (s && s.endpoint) authorSubs.set(s.endpoint, s);
          }
          inMemorySubscriptions.set(key, authorSubs);
        }
      } catch {
        // ignore
      }
    }
  }

  return authorSubs ? Array.from(authorSubs.values()) : [];
}

export async function sendPushToAuthor(
  roomId: string,
  authorId: string,
  payload: { title: string; body: string }
): Promise<boolean> {
  try {
    const subs = await getPushSubscriptions(roomId, authorId);
    if (!subs.length) return false;

    let anyDelivered = false;
    const deadEndpoints: string[] = [];

    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(sub, JSON.stringify(payload), {
            TTL: 86400, // 24-hour guarantee so mobile receives immediately when unlocked or reconnected
            urgency: 'high', // Maximum priority: wakes Android & iOS from Doze and deep sleep
          });
          anyDelivered = true;
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            deadEndpoints.push(sub.endpoint);
          }
        }
      })
    );

    // Prune expired or unsubscribed endpoints cleanly
    if (deadEndpoints.length > 0) {
      const key = `${roomId}:${authorId}`;
      const authorSubs = inMemorySubscriptions.get(key);
      if (authorSubs) {
        deadEndpoints.forEach((ep) => authorSubs.delete(ep));
        const redis = getRedisClient();
        if (redis && isRedisWritable()) {
          const remaining = Array.from(authorSubs.values());
          if (remaining.length > 0) {
            redis
              .set(`room:${roomId}:push:${authorId}`, JSON.stringify(remaining), {
                ex: 30 * 24 * 3600,
              })
              .catch(markRedisNonWritable);
          } else {
            redis.del(`room:${roomId}:push:${authorId}`).catch(markRedisNonWritable);
          }
        }
      }
    }

    return anyDelivered;
  } catch (err) {
    console.warn('sendPushToAuthor notice:', err);
    return false;
  }
}
