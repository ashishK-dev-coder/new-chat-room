import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateRoom, getRoomMessagesAsync, getActiveAuthorCount } from '@/lib/chatStore';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get('room') || 'default-room';

    const room = getOrCreateRoom(roomId);
    const messages = await getRoomMessagesAsync(roomId);
    const clientCount = getActiveAuthorCount(room);

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
