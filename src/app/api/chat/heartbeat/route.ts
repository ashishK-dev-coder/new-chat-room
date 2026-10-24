import { NextRequest, NextResponse } from 'next/server';
import { recordAuthorHeartbeat } from '@/lib/chatStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { roomId = 'default-room', senderId } = body;

    if (senderId) {
      const clientCount = recordAuthorHeartbeat(roomId, senderId);
      return NextResponse.json({ success: true, clientCount });
    }

    return NextResponse.json({ success: false });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
