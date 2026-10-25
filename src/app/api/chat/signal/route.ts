import { NextRequest, NextResponse } from 'next/server';
import { broadcastSignal, authenticateAuthor, WebRTCSignal } from '@/lib/chatStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomId = 'default-room', senderId, password, type, targetId, data } = body;

    if (!type) {
      return NextResponse.json({ error: 'Signal type is required' }, { status: 400 });
    }

    // Authenticate author if password provided
    let resolvedSenderId = senderId === 'author-2' ? 'author-2' : 'author-1';
    if (password) {
      const auth = authenticateAuthor(password);
      if (auth.valid && auth.authorId) {
        resolvedSenderId = auth.authorId;
      }
    }

    const signal: WebRTCSignal = {
      type,
      senderId: resolvedSenderId,
      targetId: targetId || (resolvedSenderId === 'author-2' ? 'author-1' : 'author-2'),
      data,
      timestamp: Date.now(),
    };

    const res = await broadcastSignal(roomId, signal);
    return NextResponse.json({ success: true, deliveredCount: res.deliveredCount });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
