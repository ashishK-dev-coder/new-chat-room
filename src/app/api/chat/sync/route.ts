import { NextRequest, NextResponse } from 'next/server';
import {
  getOrCreateRoom,
  getRoomMessagesAsync,
  getActiveAuthorCount,
  isBothAuthorsUnlocked,
  getUnlockedAuthorCount,
  syncAuthorPresenceAsync,
  popAllSignalsAsync,
} from '@/lib/chatStore';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get('room') || 'default-room';
    const rawSenderId = searchParams.get('senderId');
    const senderId = rawSenderId === 'author-2' ? 'author-2' : rawSenderId === 'author-1' ? 'author-1' : null;
    const rawUnlocked = searchParams.get('unlocked');

    const room = getOrCreateRoom(roomId);

    // 1. Synchronize Author Presence across serverless Lambdas using Redis + Memory
    const presence = senderId
      ? await syncAuthorPresenceAsync(roomId, senderId, rawUnlocked === 'true')
      : {
          bothUnlocked: isBothAuthorsUnlocked(room),
          clientCount: getActiveAuthorCount(room),
          unlockedCount: getUnlockedAuthorCount(room),
        };

    // 2. Fetch room messages
    const messages = await getRoomMessagesAsync(roomId);

    // 3. Pop all pending WebRTC signals (offer, answer, candidate, preview-invite, preview-accept)
    const allSignals = senderId ? await popAllSignalsAsync(roomId, senderId) : [];
    const latestSignal = allSignals.length > 0 ? allSignals[allSignals.length - 1] : null;

    return NextResponse.json(
      {
        messages,
        clientCount: presence.clientCount,
        bothUnlocked: presence.bothUnlocked,
        unlockedCount: presence.unlockedCount,
        signal: latestSignal,
        signals: allSignals,
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
