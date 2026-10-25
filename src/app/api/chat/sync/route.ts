import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateRoom, getRoomMessagesAsync, getActiveAuthorCount, recordAuthorHeartbeat, popPendingSignals } from '@/lib/chatStore';
import { getRedisClient } from '@/lib/redis';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get('room') || 'default-room';
    const rawSenderId = searchParams.get('senderId');
    const senderId = rawSenderId === 'author-2' ? 'author-2' : rawSenderId === 'author-1' ? 'author-1' : null;

    const room = getOrCreateRoom(roomId);
    if (senderId) {
      recordAuthorHeartbeat(roomId, senderId);
    }

    const messages = await getRoomMessagesAsync(roomId);
    const clientCount = getActiveAuthorCount(room);

    let pendingSignal = null;
    if (senderId) {
      const inMemorySignals = popPendingSignals(roomId, senderId);
      if (inMemorySignals.length > 0) {
        pendingSignal = inMemorySignals[inMemorySignals.length - 1];
      }
    }

    const redis = getRedisClient();
    if (!pendingSignal && redis && senderId) {
      try {
        const raw = await redis.get<string | object>(`room:${roomId}:signal:${senderId}`);
        if (raw) {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          pendingSignal = parsed?.signal || parsed;
          redis.del(`room:${roomId}:signal:${senderId}`).catch(() => {});
        }
      } catch {
        // ignore
      }
    }

    return NextResponse.json(
      {
        messages,
        clientCount,
        signal: pendingSignal,
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
