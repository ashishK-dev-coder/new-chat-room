import { NextRequest } from 'next/server';
import { getOrCreateRoom, getRoomMessages, subscribeToRoom } from '@/lib/chatStore';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get('room') || 'default-room';

  // Ensure room exists
  getOrCreateRoom(roomId);

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  let keepAliveTimer: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // 1. Function to push SSE chunks
      const sendChunk = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // stream closed
        }
      };

      // 2. Register client listener
      cleanup = subscribeToRoom(roomId, sendChunk);

      // 3. Immediately send current messages (max 4)
      const currentMessages = getRoomMessages(roomId);
      const initPayload = JSON.stringify({
        type: 'init',
        messages: currentMessages,
      });
      sendChunk(`data: ${initPayload}\n\n`);

      // 4. Keep-alive heartbeat every 15 seconds to prevent browser timeout
      keepAliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          if (keepAliveTimer) clearInterval(keepAliveTimer);
        }
      }, 15000);
    },
    cancel() {
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      if (cleanup) cleanup();
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
