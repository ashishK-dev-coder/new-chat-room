import type { Metadata, Viewport } from 'next';
import React from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI_Engineer_Architecture_Framework.docx - Word',
  description: 'AI Systems Engineering Architecture Specification',
  manifest: '/manifest.json',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23185abd"><path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3 4l2.5 10h1.5l2-8 2 8h1.5L19 7h-2l-1.5 7-1.75-7h-1.5L10.5 14 9 7H7z"/></svg>',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full flex flex-col antialiased bg-[#f3f2f1] text-[#201f1e] overflow-hidden select-none">
        {children}
      </body>
    </html>
  );
}
