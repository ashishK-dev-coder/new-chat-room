import { NextRequest, NextResponse } from 'next/server';
import { addMessageToRoom, authenticateAuthor } from '@/lib/chatStore';
import { sendPushToAuthor } from '@/lib/webPush';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, roomId = 'default-room', senderId, senderName, text, password, replyTo } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
    }

    // Authenticate author by password and strictly resolve official author identity (author-1 vs author-2)
    if (!password) {
      return NextResponse.json({ error: 'Unauthorized: Author password required' }, { status: 401 });
    }

    const auth = authenticateAuthor(password);
    if (!auth.valid || !auth.authorId) {
      return NextResponse.json({ error: 'Unauthorized: Invalid author password' }, { status: 401 });
    }

    const resolvedSenderId = auth.authorId;
    const resolvedSenderName = auth.authorName || (auth.authorId === 'author-2' ? 'Author 2' : 'Author 1');

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

    // Trigger high-urgency Web Push to peer author (wakes up Android even when screen is locked)
    // Await delivery so serverless lambda does not freeze before FCM delivers to Google
    const targetAuthorId = resolvedSenderId === 'author-2' ? 'author-1' : 'author-2';
    try {
      await sendPushToAuthor(roomId, targetAuthorId, {
        title: 'Document Notice',
        body: 'New clause updated in working document.',
      });
    } catch {
      // ignore push errors so message still succeeds
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
