import { NextRequest, NextResponse } from 'next/server';
import { recordAuthorHeartbeat } from '@/lib/chatStore';
import { getRedisClient } from '@/lib/redis';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { roomId = 'default-room', senderId } = body;

    if (senderId) {
      let clientCount = recordAuthorHeartbeat(roomId, senderId);

      const redis = getRedisClient();
      if (redis) {
        try {
          const keys = await redis.keys(`room:${roomId}:author:*`);
          if (Array.isArray(keys) && keys.length > 0) {
            clientCount = Math.min(2, Math.max(1, keys.length));
          }
        } catch {
          // fallback
        }
      }

      return NextResponse.json({ success: true, clientCount });
    }

    return NextResponse.json({ success: false });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
