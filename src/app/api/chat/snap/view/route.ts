import { NextRequest, NextResponse } from 'next/server';

declare global {
  // eslint-disable-next-line no-var
  var __ephemeralSnapStore: Map<string, string> | undefined;
}
const localSnapStore = global.__ephemeralSnapStore || new Map<string, string>();

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return new NextResponse('Snap not found', { status: 404 });
  }

  const base64Data = localSnapStore.get(id);
  if (!base64Data) {
    return new NextResponse('Snap expired or already burned', { status: 410 });
  }

  // Convert base64 to image buffer and serve
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return new NextResponse('Invalid image data', { status: 400 });
  }

  const contentType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    },
  });
}

