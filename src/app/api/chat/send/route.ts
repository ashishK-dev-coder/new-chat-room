import { NextRequest, NextResponse } from 'next/server';
import { addMessageToRoom, authenticateAuthor } from '@/lib/chatStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, roomId = 'default-room', senderId, senderName, text, password, replyTo } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
    }

    // Authenticate author by password and resolve official author identity
    let resolvedSenderId = senderId || 'author-1';
    let resolvedSenderName = senderName || 'Author';

    if (password !== undefined) {
      const auth = authenticateAuthor(password);
      if (!auth.valid) {
        return NextResponse.json({ error: 'Unauthorized: Invalid author password' }, { status: 401 });
      }
      resolvedSenderId = auth.authorId || resolvedSenderId;
      resolvedSenderName = auth.authorName || resolvedSenderName;
    }

    const result = await addMessageToRoom(roomId, {
      id,
      senderId: resolvedSenderId,
      senderName: resolvedSenderName,
      text: text.trim(),
      replyTo,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to send' }, { status: 403 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
