import { NextRequest, NextResponse } from 'next/server';
import { addMessageToRoom, verifyRoomPassword } from '@/lib/chatStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomId = 'default-room', senderId, senderName, text, password } = body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });
    }

    // Verify password if required
    if (password !== undefined && !verifyRoomPassword(roomId, password)) {
      return NextResponse.json({ error: 'Unauthorized: Invalid password' }, { status: 401 });
    }

    const result = addMessageToRoom(roomId, {
      senderId: senderId || 'anonymous',
      senderName: senderName || 'User',
      text: text.trim(),
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
