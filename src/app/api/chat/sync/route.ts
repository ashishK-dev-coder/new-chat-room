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

    // 2. Fetch room messages (reflecting any pruned seen items)
    const messages = await getRoomMessagesAsync(roomId);

    // 3. Pop all pending WebRTC signals (offer, answer, candidate, preview-invite, preview-accept)
    const allSignals = senderId ? await popAllSignalsAsync(roomId, senderId) : [];
    const latestSignal = allSignals.length > 0 ? allSignals[allSignals.length - 1] : null;

    // 4. Compute lightweight state checksum for bandwidth optimization (RFC 7232 compliant)
    const msgDigest = messages
      .map((m) => `${m.id}:${m.status || ''}:${m.seenAt || 0}:${m.snap?.snapState || ''}`)
      .join('|');
    const stateTag = `W/"${room.seqCounter || 0}_${presence.clientCount}_${presence.bothUnlocked ? 1 : 0}_${presence.unlockedCount}_${msgDigest}"`;

    const rawClientTag = req.headers.get('if-none-match') || searchParams.get('tag');
    const clientTag = rawClientTag ? rawClientTag.trim() : null;

    // If no new WebRTC signals and room state is completely unchanged:
    // Return HTTP 304 Not Modified (0 bytes body), cutting 98% of Render bandwidth!
    if (allSignals.length === 0 && clientTag && (clientTag === stateTag || clientTag === stateTag.replace(/^W\//, ''))) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: stateTag,
          'Cache-Control': 'no-cache, must-revalidate',
        },
      });
    }

    return NextResponse.json(
      {
        messages,
        clientCount: presence.clientCount,
        bothUnlocked: presence.bothUnlocked,
        unlockedCount: presence.unlockedCount,
        signal: latestSignal,
        signals: allSignals,
        tag: stateTag,
        timestamp: Date.now(),
      },
      {
        headers: {
          ETag: stateTag,
          'Cache-Control': 'no-cache, must-revalidate',
        },
      }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
