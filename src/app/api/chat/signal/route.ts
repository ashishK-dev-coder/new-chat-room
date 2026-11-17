import { NextRequest, NextResponse } from 'next/server';
import { broadcastSignal, authenticateAuthor, WebRTCSignal } from '@/lib/chatStore';
import { sendPushToAuthor } from '@/lib/webPush';

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

    const resolvedTargetId = targetId || (resolvedSenderId === 'author-2' ? 'author-1' : 'author-2');

    const signal: WebRTCSignal = {
      type,
      senderId: resolvedSenderId,
      targetId: resolvedTargetId,
      data,
      timestamp: Date.now(),
    };

    const res = await broadcastSignal(roomId, signal);

    // If this is an incoming call invite (voice or video preview), send high-urgency Web Push!
    // This wakes up the peer author's phone from lock screen & Doze mode so their phone rings!
    if (type === 'preview-invite' || type === 'voice-invite') {
      const isVoice = type === 'voice-invite';
      sendPushToAuthor(roomId, resolvedTargetId, {
        title: isVoice ? 'Incoming Document Voice Review' : 'Incoming Visual Stream Request',
        body: isVoice
          ? 'Co-author requested an urgent Document Voice Review session.'
          : 'Co-author requested an urgent Visual Stream connection.',
      }).catch((err) => {
        console.warn('Call Web Push notice:', err);
      });
    }

    return NextResponse.json({ success: true, deliveredCount: res.deliveredCount });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
