import { NextRequest, NextResponse } from 'next/server';
import { getRoomMessages, authenticateAuthor } from '@/lib/chatStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomId = 'default-room', password = '' } = body;

    const auth = authenticateAuthor(password);

    if (!auth.valid) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Incorrect document password' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      authorId: auth.authorId,
      authorName: auth.authorName,
      messages: getRoomMessages(roomId),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
