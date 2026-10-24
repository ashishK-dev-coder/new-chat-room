import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateRoom, getRoomMessagesAsync, getActiveAuthorCount, recordAuthorHeartbeat } from '@/lib/chatStore';
import { getRedisClient } from '@/lib/redis';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get('room') || 'default-room';
    const senderId = searchParams.get('senderId');

    const room = getOrCreateRoom(roomId);
    if (senderId) {
      recordAuthorHeartbeat(roomId, senderId);
    }

    const messages = await getRoomMessagesAsync(roomId);
    let clientCount = getActiveAuthorCount(room);

    // Cross-lambda presence check via Redis keys if configured
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

    return NextResponse.json(
      {
        messages,
        clientCount,
        timestamp: Date.now(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
