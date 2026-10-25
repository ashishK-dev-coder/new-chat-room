import { NextRequest } from 'next/server';
import {
  getOrCreateRoom,
  getRoomMessages,
  subscribeToRoom,
  getActiveAuthorCount,
  recordAuthorHeartbeat,
  setAuthorUnlockedStatus,
  isBothAuthorsUnlocked,
  getUnlockedAuthorCount,
} from '@/lib/chatStore';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get('room') || 'default-room';
  const rawSenderId = searchParams.get('senderId');
  const senderId = rawSenderId === 'author-2' ? 'author-2' : 'author-1';
  const rawUnlocked = searchParams.get('unlocked');

  // Ensure room exists
  const room = getOrCreateRoom(roomId);
  if (rawUnlocked !== null) {
    setAuthorUnlockedStatus(roomId, senderId, rawUnlocked === 'true');
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  let keepAliveTimer: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // 1. Function to push SSE chunks
      const sendChunk = (data: string): boolean => {
        try {
          controller.enqueue(encoder.encode(data));
          return true;
        } catch {
          if (cleanup) {
            cleanup();
            cleanup = null;
          }
          return false;
        }
      };

      // 2. Register client listener with senderId and 2-person limit
      const subResult = subscribeToRoom(roomId, senderId, sendChunk);

      if (!subResult.allowed) {
        // Room capacity exceeded (strictly 2 authors allowed)
        sendChunk(
          `data: ${JSON.stringify({
            type: 'error',
            error: 'Document capacity reached: strictly 2 co-authors allowed.',
            clientCount: 2,
          })}\n\n`
        );
        try {
          controller.close();
        } catch {
          // ignore
        }
        return;
      }

      cleanup = subResult.unsubscribe;

      // 3. Immediately send current messages (max 4) AND current author count & unlock status
      const currentMessages = getRoomMessages(roomId);
      const currentCount = getActiveAuthorCount(room);
      const bothUnlocked = isBothAuthorsUnlocked(room);
      const unlockedCount = getUnlockedAuthorCount(room);

      const initPayload = JSON.stringify({
        type: 'init',
        messages: currentMessages,
        clientCount: currentCount,
        bothUnlocked,
        unlockedCount,
      });
      sendChunk(`data: ${initPayload}\n\n`);

      // 4. Fast keep-alive heartbeat every 3 seconds to immediately detect cut/leave connections
      // and rapidly push presence count & unlock status updates
      let lastReportedCount = currentCount;
      let lastReportedBothUnlocked = bothUnlocked;
      keepAliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
          // Refresh heartbeat for this live SSE client
          recordAuthorHeartbeat(roomId, senderId);
          const count = getActiveAuthorCount(room);
          const currentBothUnlocked = isBothAuthorsUnlocked(room);
          if (count !== lastReportedCount || currentBothUnlocked !== lastReportedBothUnlocked) {
            lastReportedCount = count;
            lastReportedBothUnlocked = currentBothUnlocked;
            sendChunk(
              `data: ${JSON.stringify({
                type: 'presence',
                clientCount: count,
                bothUnlocked: currentBothUnlocked,
              })}\n\n`
            );
          }
        } catch {
          if (keepAliveTimer) {
            clearInterval(keepAliveTimer);
            keepAliveTimer = null;
          }
          if (cleanup) {
            cleanup();
            cleanup = null;
          }
        }
      }, 3000);

      // 5. Instantly clean up on browser tab close / page navigation abort
      if (req.signal) {
        req.signal.addEventListener('abort', () => {
          if (keepAliveTimer) {
            clearInterval(keepAliveTimer);
            keepAliveTimer = null;
          }
          if (cleanup) {
            cleanup();
            cleanup = null;
          }
        });
      }
    },
    cancel() {
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
