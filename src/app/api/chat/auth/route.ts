import { NextRequest, NextResponse } from 'next/server';
import { getRoomMessagesAsync, authenticateAuthor, setAuthorUnlockedStatus } from '@/lib/chatStore';

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

    if (auth.authorId) {
      setAuthorUnlockedStatus(roomId, auth.authorId, true);
    }

    const messages = await getRoomMessagesAsync(roomId);

    return NextResponse.json({
      success: true,
      authorId: auth.authorId,
      authorName: auth.authorName,
      messages,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
