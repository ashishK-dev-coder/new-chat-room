import { NextRequest, NextResponse } from 'next/server';
import { clearRoomMessages } from '@/lib/chatStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { roomId = 'default-room', senderId } = body;

    const result = clearRoomMessages(roomId, senderId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
