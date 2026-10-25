import { NextRequest, NextResponse } from 'next/server';
import { savePushSubscription, VAPID_PUBLIC_KEY } from '@/lib/webPush';

export async function GET() {
  return NextResponse.json({ publicKey: VAPID_PUBLIC_KEY });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomId = 'default-room', authorId, subscription } = body;

    if (!authorId || !subscription || !subscription.endpoint) {
      return NextResponse.json({ error: 'Missing authorId or subscription' }, { status: 400 });
    }

    await savePushSubscription(roomId, authorId, subscription);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
