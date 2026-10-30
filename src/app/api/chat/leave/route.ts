import { NextRequest, NextResponse } from 'next/server';
import { removeAuthorFromRoom, pruneSeenMessagesAsync } from '@/lib/chatStore';

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      body = await req.json().catch(() => ({}));
    }
    const { roomId = 'default-room', senderId } = body;

    if (senderId) {
      removeAuthorFromRoom(roomId, senderId);
      await pruneSeenMessagesAsync(roomId, senderId);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
