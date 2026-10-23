import { NextRequest, NextResponse } from 'next/server';
import { getRoomMessages, verifyRoomPassword } from '@/lib/chatStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomId = 'default-room', password = '' } = body;

    const isValid = verifyRoomPassword(roomId, password);

    if (!isValid) {
      return NextResponse.json({ success: false, error: 'Incorrect document password' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      messages: getRoomMessages(roomId),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
