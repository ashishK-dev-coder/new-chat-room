import { NextRequest, NextResponse } from 'next/server';
import { markMessagesAsSeen } from '@/lib/chatStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { roomId = 'default-room', messageIds = [], senderId = '' } = body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json({ success: true, seenIds: [] });
    }

    const result = await markMessagesAsSeen(roomId, messageIds, senderId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
