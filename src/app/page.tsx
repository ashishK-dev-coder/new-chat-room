'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { WordTitleBar } from '@/components/WordTitleBar';
import { WordRibbon, FontSettings } from '@/components/WordRibbon';
import { WordRuler } from '@/components/WordRuler';
import { ProtectedViewBanner } from '@/components/ProtectedViewBanner';
import { PasswordModal } from '@/components/PasswordModal';
import { DocumentCanvas } from '@/components/DocumentCanvas';
import { WordStatusBar } from '@/components/WordStatusBar';
import { SettingsModal } from '@/components/SettingsModal';
import { ChatMessage } from '@/lib/chatStore';

export default function WordChatApp() {
  // Session & Identity: Stable author identity per device / browser
  const [tabAuthorId, setTabAuthorId] = useState<string>('');
  const tabAuthorIdRef = useRef<string>('');

  useEffect(() => {
    // Generate or retrieve stable unique author ID per device
    let authorId: string | null = null;
    try {
      authorId = localStorage.getItem('word_author_session_id');
      if (!authorId) {
        authorId = `author_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        localStorage.setItem('word_author_session_id', authorId);
      }
    } catch {
      authorId = `author_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    }
    setTabAuthorId(authorId);
    tabAuthorIdRef.current = authorId;
  }, []);

  // Room & Protection
  const [roomId, setRoomId] = useState<string>('default-room');
  const [docTitle, setDocTitle] = useState<string>('AI_Engineer_Architecture_Framework.docx');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [showPasswordModal, setShowPasswordModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [roomPassword, setRoomPassword] = useState<string>('');

  // Messages (Strict sliding buffer of max 4 messages)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participantCount, setParticipantCount] = useState<number>(1);
  const [peerTyping] = useState<boolean>(false);

  // Stealth Notification Alert when logged out
  const [isFontColorBlinking, setIsFontColorBlinking] = useState<boolean>(false);

  // Dark Mode / Light Mode
  const [darkMode, setDarkMode] = useState<boolean>(false);

  // Formatting & Zoom
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [stealthMode, setStealthMode] = useState<'coauthor' | 'plain' | 'memo'>('coauthor');
  const [fontSettings, setFontSettings] = useState<FontSettings>({
    family: 'Calibri',
    size: 11,
    bold: false,
    italic: false,
    underline: false,
    alignment: 'left',
  });

  // Inactivity tracking reference (5 minutes)
  const lastActivityTime = useRef<number>(0);
  const isUnlockedRef = useRef<boolean>(isUnlocked);
  useEffect(() => {
    isUnlockedRef.current = isUnlocked;
  }, [isUnlocked]);

  // Audio Context Ref & HTML5 Audio Element Ref
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const isAudioPrimedRef = useRef(false);

  // Prime/Unlock Audio on any user interaction anywhere on page (One-time prime to avoid cutting off sounds on mobile)
  useEffect(() => {
    const primeAudio = () => {
      if (isAudioPrimedRef.current) return;

      try {
        // 1. Prime Web Audio Context with silent buffer
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
            audioCtxRef.current = new AudioCtx();
          }
          const ctx = audioCtxRef.current;
          if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
          }
          try {
            const buffer = ctx.createBuffer(1, 1, 22050);
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.start(0);
          } catch {
            // ignore
          }
        }

        // 2. Prime HTML5 Audio element
        if (audioElRef.current) {
          const el = audioElRef.current;
          el.load();
        }

        isAudioPrimedRef.current = true;
      } catch {
        // ignore
      }
    };

    const primeEvents = ['click', 'touchstart', 'touchend', 'pointerdown', 'keydown'];
    primeEvents.forEach((evt) => {
      window.addEventListener(evt, primeAudio, { capture: true, passive: true });
    });

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      primeEvents.forEach((evt) => {
        window.removeEventListener(evt, primeAudio, { capture: true });
      });
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Web Audio chime synthesizer (resilient to background tab suspension & timer throttling)
  const playWebAudioChime = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioCtx();
      }

      const ctx = audioCtxRef.current;

      const triggerOscillator = () => {
        try {
          const now = ctx.currentTime;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          // Two-tone chime: E5 (659.25Hz) to A5 (880Hz)
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(659.25, now);
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);

          gain.gain.setValueAtTime(0.8, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now);
          osc.stop(now + 0.47);
        } catch {
          // ignore
        }
      };

      if (ctx.state === 'suspended') {
        ctx
          .resume()
          .then(() => {
            triggerOscillator();
          })
          .catch(() => {
            triggerOscillator();
          });
      } else {
        triggerOscillator();
      }
    } catch {
      // ignore
    }
  }, []);

  // Register Service Worker for mobile system notifications & sound
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  // Request browser notification permission helper
  const requestNotificationPermission = useCallback(async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch {
          // ignore
        }
      }
    }
  }, []);

  // Trigger Word disguise system notification with phone's default ringtone/chime
  const showWordNotification = useCallback(async () => {
    if (typeof window === 'undefined') return;

    if ('Notification' in window && Notification.permission === 'granted') {
      const notifTitle = 'Microsoft Word';
      const notifBody = 'Your content was not saved to OneDrive. Document clause updated by co-author.';

      // 1. Try Service Worker showNotification (Required on Android Chrome & mobile browsers)
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          if (reg && reg.showNotification) {
            await reg.showNotification(notifTitle, {
              body: notifBody,
              icon: '/file.svg',
              badge: '/file.svg',
              tag: 'word-autosave-alert',
              silent: false, // Ensures default phone notification sound plays!
              vibrate: [300, 100, 300],
            } as any);
            return;
          }
        } catch {
          // fallback to window notification
        }
      }

      // 2. Fallback to standard window Notification
      try {
        const notif = new Notification(notifTitle, {
          body: notifBody,
          icon: '/file.svg',
          tag: 'word-autosave-alert',
          silent: false,
        });
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      } catch {
        // ignore
      }
    }
  }, []);

  // Multi-engine notification sound & default phone ringtone player
  const playNotificationSound = useCallback(() => {
    // 1. Mobile tactile haptic vibration (works on phones even in silent/vibrate mode)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([250, 100, 250]);
      } catch {
        // ignore
      }
    }

    // 2. Native System Notification with Word disguise:
    // Triggers phone's default system notification sound & banner:
    // "Microsoft Word: Your content was not saved to OneDrive."
    showWordNotification();

    // 3. Play Web Audio synthesizer chime immediately
    playWebAudioChime();

    // 4. Play preloaded HTML5 Audio element
    if (audioElRef.current) {
      try {
        const el = audioElRef.current;
        el.currentTime = 0;
        el.volume = 1.0;
        const playPromise = el.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {});
        }
      } catch {
        // ignore
      }
    }
  }, [playWebAudioChime, showWordNotification]);

  // Read URL query parameters for room
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlRoom = params.get('room');
      if (urlRoom) {
        setRoomId(urlRoom);
      }

      const unlockedSession = sessionStorage.getItem(`word_unlocked_${urlRoom || 'default-room'}`);
      if (unlockedSession === 'true') {
        setIsUnlocked(true);
      }
    }
  }, []);

  // 5-Minute Inactivity Auto-Logout Tracker
  useEffect(() => {
    lastActivityTime.current = Date.now();
    const recordActivity = () => {
      lastActivityTime.current = Date.now();
    };

    const activityEvents = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'touchmove',
      'scroll',
      'pointerdown',
      'wheel',
    ];
    activityEvents.forEach((evt) => window.addEventListener(evt, recordActivity, { passive: true }));

    const interval = setInterval(() => {
      if (isUnlockedRef.current) {
        const elapsed = Date.now() - lastActivityTime.current;
        if (elapsed >= 5 * 60 * 1000) {
          setIsUnlocked(false);
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem(`word_unlocked_${roomId}`);
          }
        }
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      activityEvents.forEach((evt) => window.removeEventListener(evt, recordActivity));
    };
  }, [roomId]);

  // Compute total words currently displayed on the page (visible only when unlocked)
  const wordCount = useMemo(() => {
    if (!isUnlocked || messages.length === 0) return 0;
    return messages.reduce((acc, msg) => {
      const words = msg.text.trim().split(/\s+/).filter(Boolean);
      return acc + words.length;
    }, 0);
  }, [messages, isUnlocked]);

  // Load cached messages on mount (prevents cold-start blanking)
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(`word_chat_msgs_${roomId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed.slice(-4));
        }
      }
    } catch {
      // ignore
    }
  }, [roomId]);

  // Sync messages to local session cache whenever messages change
  useEffect(() => {
    try {
      if (messages.length > 0) {
        sessionStorage.setItem(`word_chat_msgs_${roomId}`, JSON.stringify(messages));
      }
    } catch {
      // ignore
    }
  }, [messages, roomId]);

  // Local Panic Lock: Instantly conceals all messages and logs out locally with NO popup
  // Keeps server messages intact so other laptop is NOT disrupted and messages can be restored on unlock
  const handlePanicLock = useCallback(() => {
    setIsUnlocked(false);
    setShowPasswordModal(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(`word_unlocked_${roomId}`);
    }
  }, [roomId]);

  // Explicit Room Wipe: When intentionally clearing all messages for both laptops
  const isWipingRoomRef = useRef(false);

  const handleRoomWipe = useCallback(async () => {
    if (isWipingRoomRef.current) return;
    isWipingRoomRef.current = true;

    // 1. Immediately dismiss soft keyboard and clear text selection to prevent mobile browser hang/zoom freeze
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      sessionStorage.removeItem(`word_unlocked_${roomId}`);
      sessionStorage.removeItem(`word_chat_msgs_${roomId}`);
    }

    // 2. Clear state and lock to Protected View
    setMessages([]);
    setIsUnlocked(false);
    setShowPasswordModal(false);

    // 3. Clear on server and notify peer author
    try {
      await fetch('/api/chat/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          senderId: tabAuthorIdRef.current || 'author-local',
        }),
      });
    } catch (err) {
      console.error('Room clear error:', err);
    } finally {
      setTimeout(() => {
        isWipingRoomRef.current = false;
      }, 800);
    }
  }, [roomId]);

  // Check if pressed key is dedicated panic key: Window (Meta/OS), Fn, or Escape
  const isPanicKey = (e: KeyboardEvent): boolean => {
    const key = e.key;
    const code = e.code;
    return (
      key === 'Meta' ||
      key === 'OS' ||
      code === 'MetaLeft' ||
      code === 'MetaRight' ||
      key === 'Escape' ||
      code === 'Escape' ||
      key === 'Fn' ||
      key === 'FnLock' ||
      code === 'Fn' ||
      code === 'FnLock'
    );
  };

  // Top-level global panic key interceptor (captures before anything else)
  useEffect(() => {
    const handleGlobalPanic = (e: KeyboardEvent) => {
      if (isPanicKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        setShowPasswordModal(false);
        handlePanicLock();
      }
    };

    window.addEventListener('keydown', handleGlobalPanic, true);
    return () => window.removeEventListener('keydown', handleGlobalPanic, true);
  }, [handlePanicLock]);

  // Mobile / Touchscreen Rapid Click/Tap Interceptor (> 2 continuous clicks/taps wipes out and logs out)
  const tapHistoryRef = useRef<number[]>([]);

  useEffect(() => {
    const handleRapidTap = (e: PointerEvent) => {
      // Don't trigger if already locked or interacting inside form inputs/dialogs
      if (!isUnlockedRef.current) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest?.('[role="dialog"]') ||
        target?.closest?.('.modal-backdrop') ||
        target?.closest?.('form') ||
        target?.closest?.('textarea') ||
        target?.closest?.('input')
      ) {
        return;
      }

      const now = Date.now();
      // Keep only taps occurring within the last 650ms window
      const recent = tapHistoryRef.current.filter((t) => now - t < 650);
      recent.push(now);
      tapHistoryRef.current = recent;

      // More than 2 continuous clicks (> 2, i.e. 3 or more rapid clicks/taps)
      if (recent.length > 2) {
        tapHistoryRef.current = [];
        // Panic: wipe out messages and logout immediately!
        handleRoomWipe();
      }
    };

    window.addEventListener('pointerdown', handleRapidTap, { capture: true, passive: true });
    return () => window.removeEventListener('pointerdown', handleRapidTap, { capture: true });
  }, [handleRoomWipe]);

  // Connect to Server-Sent Events (SSE) for real-time updates
  useEffect(() => {
    if (!tabAuthorId) return;

    let eventSource: EventSource | null = null;
    let isMounted = true;

    const connectSSE = () => {
      const sseUrl = `/api/chat/stream?room=${encodeURIComponent(roomId)}&senderId=${encodeURIComponent(tabAuthorId)}`;
      eventSource = new EventSource(sseUrl);

      eventSource.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'init') {
            // Only update messages if server actually has messages
            // Never overwrite existing local messages with an empty array upon server cold-start or reconnect!
            if (Array.isArray(data.messages) && data.messages.length > 0) {
              const confirmed = data.messages.map((m: ChatMessage) => ({
                ...m,
                status: m.status || 'delivered',
              }));
              setMessages(confirmed.slice(-4));
            }
            if (data.clientCount !== undefined) {
              const count = Math.min(2, Math.max(1, Number(data.clientCount) || 1));
              setParticipantCount(count);
            }
          } else if (data.type === 'message') {
            lastActivityTime.current = Date.now();
            const incomingMsg: ChatMessage = {
              ...data.message,
              status: 'delivered', // Confirmed from server broadcast
            };
            // Append incoming message and keep ONLY latest 4
            setMessages((prev) => {
              // 1. If this exact message ID is already present (e.g. from optimistic send)
              const existingIdx = prev.findIndex((m) => m.id === incomingMsg.id);
              if (existingIdx !== -1) {
                const updated = [...prev];
                updated[existingIdx] = {
                  ...updated[existingIdx],
                  ...incomingMsg,
                  status: 'delivered',
                };
                return updated.slice(-4);
              }

              // 2. If this was our own optimistic message, replace it with confirmed message
              const optIdx = prev.findIndex(
                (m) =>
                  m.senderId === incomingMsg.senderId &&
                  m.text === incomingMsg.text &&
                  (m.status === 'pending' || m.id.startsWith('opt-'))
              );

              let updated: ChatMessage[];
              if (optIdx !== -1) {
                updated = [...prev];
                updated[optIdx] = incomingMsg;
              } else {
                updated = [...prev, incomingMsg];
              }

              return updated.slice(-4);
            });

            if (data.clientCount !== undefined) {
              setParticipantCount(Math.min(2, Math.max(1, Number(data.clientCount) || 1)));
            }

            const incomingSenderId = data.message?.senderId;
            const currentTabId = tabAuthorIdRef.current;
            // Check if the message arrived from the other author (not self)
            const isFromOtherAuthor = !incomingSenderId || incomingSenderId !== currentTabId;

            if (isFromOtherAuthor) {
              // Message from peer confirms active 2-author presence
              setParticipantCount(2);

              // 1. If currently logged out: activate discreet Font Color 'A' border alert
              if (!isUnlockedRef.current) {
                setIsFontColorBlinking(true);
              }

              // 2. Play notification sound chime:
              playNotificationSound();
            }
          } else if (data.type === 'clear') {
            setMessages([]);
            if (typeof window !== 'undefined') {
              sessionStorage.removeItem(`word_chat_msgs_${roomId}`);
            }
          } else if (data.type === 'presence') {
            // Strictly clamp to at most 2 co-authors
            const count = Math.min(2, Math.max(1, Number(data.clientCount) || 1));
            setParticipantCount(count);
          } else if (data.type === 'error') {
            console.warn('Room Notice:', data.error);
          }
        } catch {
          // ignore keep-alive
        }
      };
    };

    connectSSE();

    return () => {
      isMounted = false;
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [roomId, tabAuthorId, playNotificationSound]);

  // Instantly notify server when author leaves or closes the tab/page ("cuts the page")
  useEffect(() => {
    const sendLeaveBeacon = () => {
      const activeId = tabAuthorIdRef.current || tabAuthorId;
      if (!activeId || !roomId) return;
      const payload = JSON.stringify({ roomId, senderId: activeId });
      try {
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          navigator.sendBeacon('/api/chat/leave', new Blob([payload], { type: 'application/json' }));
        } else {
          fetch('/api/chat/leave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener('pagehide', sendLeaveBeacon);
    window.addEventListener('beforeunload', sendLeaveBeacon);

    return () => {
      window.removeEventListener('pagehide', sendLeaveBeacon);
      window.removeEventListener('beforeunload', sendLeaveBeacon);
      sendLeaveBeacon();
    };
  }, [roomId, tabAuthorId]);

  // Active author presence heartbeat (runs every 2.5s) to guarantee early detection within seconds
  useEffect(() => {
    if (!tabAuthorId) return;

    const interval = setInterval(async () => {
      const activeId = tabAuthorIdRef.current || tabAuthorId;
      if (!activeId || !roomId) return;

      try {
        const res = await fetch('/api/chat/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, senderId: activeId }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.clientCount !== undefined) {
            setParticipantCount(Math.min(2, Math.max(1, Number(data.clientCount) || 1)));
          }
        }
      } catch {
        // ignore offline ping
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [roomId, tabAuthorId]);

  // Send message handler with 0ms instant optimistic update + acknowledgment tracking
  const handleSendMessage = async (text: string, replyTo?: ChatMessage['replyTo']) => {
    if (!text.trim()) return;

    lastActivityTime.current = Date.now();
    const activeId = tabAuthorIdRef.current || tabAuthorId || `tab_${Date.now()}`;
    const trimmedText = text.trim();
    // Unique deterministic message ID generated upfront
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const optimisticMsg: ChatMessage = {
      id: messageId,
      senderId: activeId,
      senderName: 'Author',
      text: trimmedText,
      timestamp: Date.now(),
      status: 'pending', // Starts with pending...
      replyTo,
    };

    // Instant 0ms UI update: message appears immediately with pending... status
    setMessages((prev) => {
      const updated = [...prev, optimisticMsg];
      return updated.slice(-4);
    });

    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: messageId,
          roomId,
          senderId: activeId,
          senderName: 'Author',
          text: trimmedText,
          password: roomPassword,
          replyTo,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setIsUnlocked(false);
          setShowPasswordModal(true);
        } else {
          console.error('Failed to send:', data?.error);
        }
        // Mark as failed so user can click to retry
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, status: 'failed' } : m
          )
        );
      } else {
        // Confirmed & acknowledged by server!
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, status: 'delivered' } : m
          )
        );
      }
    } catch (err) {
      console.error('Network error sending message:', err);
      // Mark as failed so user can click to retry
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, status: 'failed' } : m
        )
      );
    }
  };

  // Password verification handler (unlocks document and shows messages)
  const handleVerifyPassword = async (pwdAttempt: string) => {
    try {
      const res = await fetch('/api/chat/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          password: pwdAttempt,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        requestNotificationPermission();
        setIsUnlocked(true);
        setIsFontColorBlinking(false); // Stop blinking once unlocked
        setRoomPassword(pwdAttempt);
        lastActivityTime.current = Date.now();
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(`word_unlocked_${roomId}`, 'true');
        }
        if (data.messages) {
          setMessages(data.messages.slice(-4));
        }
        return { success: true };
      } else {
        return { success: false, error: data.error || 'The password is incorrect.' };
      }
    } catch {
      return { success: false, error: 'Network error verifying password.' };
    }
  };

  const handleLockToggle = () => {
    if (isUnlocked) {
      setIsUnlocked(false);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(`word_unlocked_${roomId}`);
      }
    } else {
      setShowPasswordModal(true);
    }
  };

  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  return (
    <div
      className={`flex flex-col h-[100dvh] h-screen w-screen overflow-hidden select-none transition-colors ${
        darkMode ? 'bg-[#181818] text-[#e0e0e0]' : 'bg-[#f3f2f1] text-[#201f1e]'
      }`}
    >
      {/* Hidden preloaded HTML5 audio element for instant reliable chime */}
      <audio
        ref={audioElRef}
        src="/sounds/chime.wav"
        preload="auto"
        playsInline
        className="hidden"
      />

      {/* 1. MS Word Title Bar */}
      <WordTitleBar
        docTitle={docTitle}
        isUnlocked={isUnlocked}
        participantCount={participantCount}
        onOpenSettings={() => setShowSettingsModal(true)}
        onLockToggle={handleLockToggle}
        onPanic={handlePanicLock}
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
        isSaving={messages.some((m) => m.status === 'pending')}
      />

      {/* 2. MS Word Ribbon (Tabs + Toolbars) */}
      <WordRibbon
        fontSettings={fontSettings}
        setFontSettings={setFontSettings}
        onOpenFileMenu={() => setShowSettingsModal(true)}
        onPanicClear={handlePanicLock}
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
        isFontColorBlinking={isFontColorBlinking}
      />

      {/* 3. Protected View Banner (When locked/unauthenticated) */}
      {!isUnlocked && (
        <ProtectedViewBanner
          onEnableEditing={() => {
            requestNotificationPermission();
            setShowPasswordModal(true);
          }}
        />
      )}

      {/* 4. MS Word Ruler */}
      <WordRuler darkMode={darkMode} />

      {/* 5. Document Canvas (A4 sheet, 4 messages max, inline enter typing) */}
      <div
        className="flex-1 flex overflow-hidden w-full min-w-0"
        style={{
          transform: zoomLevel !== 100 ? `scale(${zoomLevel / 100})` : undefined,
          transformOrigin: 'top center',
        }}
      >
        <DocumentCanvas
          messages={messages}
          currentUserId={tabAuthorId}
          isUnlocked={isUnlocked}
          fontSettings={fontSettings}
          stealthMode={stealthMode}
          onSendMessage={handleSendMessage}
          onRequireUnlock={() => {
            requestNotificationPermission();
            setShowPasswordModal(true);
          }}
          onPanicClear={handlePanicLock}
          onPanicWipe={handleRoomWipe}
          peerTyping={peerTyping}
          darkMode={darkMode}
        />
      </div>

      {/* 6. MS Word Status Bar */}
      <WordStatusBar
        wordCount={wordCount}
        zoomLevel={zoomLevel}
        setZoomLevel={setZoomLevel}
        isUnlocked={isUnlocked}
        darkMode={darkMode}
      />

      {/* Password Dialog Modal */}
      <PasswordModal
        isOpen={showPasswordModal}
        docTitle={docTitle}
        onClose={() => setShowPasswordModal(false)}
        onVerify={handleVerifyPassword}
      />

      {/* Backstage Properties & Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        roomId={roomId}
        setRoomId={(newRoom) => {
          setRoomId(newRoom);
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.set('room', newRoom);
            window.history.replaceState({}, '', url.toString());
          }
        }}
        docTitle={docTitle}
        setDocTitle={setDocTitle}
        stealthMode={stealthMode}
        setStealthMode={setStealthMode}
        onPanicClear={handleRoomWipe}
        currentPassword={roomPassword}
        setCurrentPassword={setRoomPassword}
        onRequestNotification={requestNotificationPermission}
      />
    </div>
  );
}
