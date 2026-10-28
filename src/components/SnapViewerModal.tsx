'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ArrowLeft, Flame, ShieldAlert, ChevronDown } from 'lucide-react';
import { ChatMessage } from '@/lib/chatStore';

interface SnapViewerModalProps {
  isOpen: boolean;
  message: ChatMessage | null;
  onCloseAndBurn: (messageId: string, publicId?: string) => void;
  darkMode?: boolean;
}

export const SnapViewerModal: React.FC<SnapViewerModalProps> = ({
  isOpen,
  message,
  onCloseAndBurn,
  darkMode = false,
}) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(10);
  const [translateY, setTranslateY] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [hasBurned, setHasBurned] = useState<boolean>(false);

  const startYRef = useRef<number>(0);
  const currentYRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasBurnedRef = useRef<boolean>(false);

  const duration = message?.snap?.duration || 10;
  const messageId = message?.id;
  const publicId = message?.snap?.publicId;
  const mediaUrl = message?.snap?.mediaUrl;

  const triggerBurnAndClose = useCallback(() => {
    if (hasBurnedRef.current || !messageId) return;
    hasBurnedRef.current = true;
    setHasBurned(true);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    onCloseAndBurn(messageId, publicId);
  }, [messageId, publicId, onCloseAndBurn]);

  // Start countdown timer on open
  useEffect(() => {
    if (isOpen && messageId && !hasBurnedRef.current) {
      setSecondsLeft(duration);
      hasBurnedRef.current = false;
      setHasBurned(false);
      setTranslateY(0);

      timerRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            triggerBurnAndClose();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isOpen, messageId, duration, triggerBurnAndClose]);

  // Touch handlers for "Slide Down to Close / Burn"
  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
    currentYRef.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) {
      currentYRef.current = e.touches[0].clientY;
      setTranslateY(delta);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (translateY > 90) {
      // Slid down sufficiently -> burn and close
      triggerBurnAndClose();
    } else {
      setTranslateY(0);
    }
  };

  // Keyboard escape handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        triggerBurnAndClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, triggerBurnAndClose]);

  if (!isOpen || !message || !mediaUrl || hasBurned) return null;

  const progressPct = ((duration - secondsLeft) / duration) * 100;

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col select-none touch-none animate-in fade-in duration-150 overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Top Countdown & Status Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex flex-col p-3 bg-gradient-to-b from-black/80 to-transparent">
        {/* Animated Progress Bar */}
        <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden mb-2.5">
          <div
            className="h-full bg-amber-400 transition-all duration-1000 ease-linear"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-white px-1">
          <button
            type="button"
            onClick={triggerBurnAndClose}
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 active:bg-white/35 backdrop-blur-md text-xs font-semibold transition-all cursor-pointer shadow"
            title="Slide or click to close (Cannot reopen)"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Slide / Back</span>
          </button>

          <div className="flex items-center space-x-2">
            <span className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-red-900/60 backdrop-blur-md text-red-300 text-[11px] font-mono font-bold shadow">
              <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>{secondsLeft}s</span>
            </span>
          </div>
        </div>

        {/* Slide Hint Pill */}
        <div className="flex items-center justify-center mt-1">
          <div className="flex items-center space-x-1 text-[10px] text-white/60 bg-black/40 px-2.5 py-0.5 rounded-full backdrop-blur-xs">
            <ChevronDown className="w-3 h-3 animate-bounce" />
            <span>Slide down or click Back to close</span>
          </div>
        </div>
      </div>

      {/* Snap Photo Canvas / Frame */}
      <div
        className="flex-1 w-full h-full flex items-center justify-center p-0 transition-transform duration-75"
        style={{
          transform: `translateY(${translateY}px)`,
          opacity: Math.max(0.3, 1 - translateY / 300),
        }}
      >
        <img
          src={mediaUrl}
          alt="Confidential Exhibit Snap"
          className="max-w-full max-h-full object-contain pointer-events-none select-none"
          draggable={false}
        />
      </div>

      {/* Bottom Ephemeral Security Watermark */}
      <div className="absolute bottom-3 left-0 right-0 z-20 flex items-center justify-center pointer-events-none">
        <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white/80 text-[10.5px]">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          <span>Confidential Exhibit • View Once • Burn on Close</span>
        </div>
      </div>
    </div>
  );
};

