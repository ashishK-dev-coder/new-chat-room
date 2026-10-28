import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { burnSnapMessage } from '@/lib/chatStore';

declare global {
  // eslint-disable-next-line no-var
  var __ephemeralSnapStore: Map<string, string> | undefined;
}
const localSnapStore = global.__ephemeralSnapStore || new Map<string, string>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomId = 'default-room', messageId, readerId, publicId } = body;

    if (!messageId) {
      return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
    }

    // 1. Burn message in server chat store & notify both clients via SSE
    const result = await burnSnapMessage(roomId, messageId, readerId || 'peer');

    // 2. Wipe from local in-memory fallback store
    if (publicId && localSnapStore.has(publicId)) {
      localSnapStore.delete(publicId);
    }

    // 3. Asynchronously trigger Cloudinary destruction if credentials exist
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (cloudName && apiKey && apiSecret && publicId) {
      try {
        const timestamp = Math.round(new Date().getTime() / 1000).toString();
        const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
        const signature = crypto.createHash('sha1').update(paramsToSign).digest('hex');

        const formData = new URLSearchParams();
        formData.append('public_id', publicId);
        formData.append('timestamp', timestamp);
        formData.append('api_key', apiKey);
        formData.append('signature', signature);

        fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
          method: 'POST',
          body: formData,
        }).catch((err) => console.warn('Cloudinary destroy error:', err));
      } catch (err) {
        console.warn('Cloudinary burn error:', err);
      }
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

