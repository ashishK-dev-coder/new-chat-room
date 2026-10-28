import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { addMessageToRoom, authenticateAuthor, SnapMetadata } from '@/lib/chatStore';
import { sendPushToAuthor } from '@/lib/webPush';

// In-memory fallback storage for when Cloudinary credentials are not configured yet
declare global {
  // eslint-disable-next-line no-var
  var __ephemeralSnapStore: Map<string, string> | undefined;
}
const localSnapStore = global.__ephemeralSnapStore || new Map<string, string>();
if (process.env.NODE_ENV !== 'production') {
  global.__ephemeralSnapStore = localSnapStore;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      roomId = 'default-room',
      password,
      imageBase64,
      duration = 10,
    } = body;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json({ error: 'Image data is required' }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ error: 'Unauthorized: Author password required' }, { status: 401 });
    }

    const auth = authenticateAuthor(password);
    if (!auth.valid || !auth.authorId) {
      return NextResponse.json({ error: 'Unauthorized: Invalid author password' }, { status: 401 });
    }

    const resolvedSenderId = auth.authorId;
    const resolvedSenderName = auth.authorName || (auth.authorId === 'author-2' ? 'Author 2' : 'Author 1');

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

    let mediaUrl = '';
    let publicId = `snap_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // 1. If Cloudinary credentials are provided, upload to Cloudinary REST API
    if (cloudName && (uploadPreset || (apiKey && apiSecret))) {
      try {
        const formData = new URLSearchParams();
        formData.append('file', imageBase64);
        formData.append('folder', 'word-chat/snaps');

        if (uploadPreset) {
          formData.append('upload_preset', uploadPreset);
        } else if (apiKey && apiSecret) {
          const timestamp = Math.round(new Date().getTime() / 1000).toString();
          const paramsToSign = `folder=word-chat/snaps&timestamp=${timestamp}${apiSecret}`;
          const signature = crypto.createHash('sha1').update(paramsToSign).digest('hex');

          formData.append('timestamp', timestamp);
          formData.append('api_key', apiKey);
          formData.append('signature', signature);
        }

        const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
          method: 'POST',
          body: formData,
        });

        if (cloudRes.ok) {
          const cloudData = await cloudRes.json();
          mediaUrl = cloudData.secure_url || cloudData.url;
          publicId = cloudData.public_id || publicId;
        } else {
          console.warn('Cloudinary upload error response:', await cloudRes.text());
        }
      } catch (cloudErr) {
        console.warn('Cloudinary upload network error:', cloudErr);
      }
    }

    // 2. Fallback to in-memory ephemeral store if Cloudinary is not configured or failed
    if (!mediaUrl) {
      localSnapStore.set(publicId, imageBase64);
      mediaUrl = `/api/chat/snap/view?id=${encodeURIComponent(publicId)}`;
    }

    const snapMetadata: SnapMetadata = {
      isSnap: true,
      mediaUrl,
      publicId,
      snapState: 'unread',
      duration,
    };

    const result = await addMessageToRoom(roomId, {
      senderId: resolvedSenderId,
      senderName: resolvedSenderName,
      text: '📷 Confidential Exhibit (Snap)',
      snap: snapMetadata,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to send snap' }, { status: 403 });
    }

    // High priority Push Notification to peer
    const targetAuthorId = resolvedSenderId === 'author-2' ? 'author-1' : 'author-2';
    sendPushToAuthor(roomId, targetAuthorId, {
      title: 'Confidential Exhibit',
      body: 'New confidential snapshot received in document.',
    }).catch((err) => {
      console.warn('Snap push notice:', err);
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

