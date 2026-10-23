import { NextRequest } from 'next/server';
import { getOrCreateRoom, getRoomMessages, subscribeToRoom, getActiveAuthorCount } from '@/lib/chatStore';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get('room') || 'default-room';
  const senderId = searchParams.get('senderId') || `author_${Date.now()}`;

  // Ensure room exists
  const room = getOrCreateRoom(roomId);

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

      // 3. Immediately send current messages (max 4) AND current author count
      const currentMessages = getRoomMessages(roomId);
      const currentCount = getActiveAuthorCount(room);

      const initPayload = JSON.stringify({
        type: 'init',
        messages: currentMessages,
        clientCount: currentCount,
      });
      sendChunk(`data: ${initPayload}\n\n`);

      // 4. Keep-alive heartbeat every 15 seconds to prevent browser & Vercel timeout
      // and periodically refresh presence count
      keepAliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
          const count = getActiveAuthorCount(room);
          sendChunk(`data: ${JSON.stringify({ type: 'presence', clientCount: count })}\n\n`);
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
      }, 15000);
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
