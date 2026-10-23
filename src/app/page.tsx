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

  // Prime/Unlock Audio on any user interaction anywhere on page
  useEffect(() => {
    const primeAudio = () => {
      try {
        // 1. Prime HTML5 Audio element with an instant silent playback
        if (audioElRef.current) {
          const el = audioElRef.current;
          el.volume = 0.01;
          const p = el.play();
          if (p !== undefined) {
            p.then(() => {
              el.pause();
              el.currentTime = 0;
              el.volume = 0.95;
            }).catch(() => {
              el.volume = 0.95;
            });
          }
        }

        // 2. Prime Web Audio Context with silent buffer
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
      } catch {
        // ignore
      }
    };

    const primeEvents = ['click', 'keydown', 'pointerdown', 'mousedown', 'touchstart', 'focus'];
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

          gain.gain.setValueAtTime(0.7, now);
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

  // Dual-engine notification sound player (Works reliably in active or background tabs)
  const playNotificationSound = useCallback(() => {
    let html5Succeeded = false;

    // 1. Try DOM preloaded audio element
    if (audioElRef.current) {
      try {
        const el = audioElRef.current;
        el.currentTime = 0;
        el.volume = 0.95;
        const playPromise = el.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              html5Succeeded = true;
            })
            .catch(() => {
              // DOM audio blocked or rejected in background tab; fallback directly to Web Audio chime
              playWebAudioChime();
            });
        }
      } catch {
        playWebAudioChime();
      }
    }

    // 2. If the user is currently on another tab or window is unfocused:
    // Fire Web Audio chime immediately without setTimeout delays (which browsers throttle in inactive tabs)
    const isBackgroundTab =
      typeof document !== 'undefined' && (document.hidden || !document.hasFocus());

    if (isBackgroundTab) {
      playWebAudioChime();
    } else {
      setTimeout(() => {
        if (!html5Succeeded) {
          playWebAudioChime();
        }
      }, 50);
    }
  }, [playWebAudioChime]);

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

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
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
  const handleRoomWipe = useCallback(async () => {
    setMessages([]);
    setIsUnlocked(false);
    setShowPasswordModal(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(`word_unlocked_${roomId}`);
      sessionStorage.removeItem(`word_chat_msgs_${roomId}`);
    }

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
              setMessages(data.messages.slice(-4));
            }
            if (data.clientCount !== undefined) {
              const count = Math.min(2, Math.max(1, Number(data.clientCount) || 1));
              setParticipantCount(count);
            }
          } else if (data.type === 'message') {
            const incomingMsg = data.message;
            // Append incoming message and keep ONLY latest 4
            setMessages((prev) => {
              const alreadyExists = prev.some((m) => m.id === incomingMsg.id);
              if (alreadyExists) return prev;

              // If this was our own optimistic message, replace it with confirmed message
              const optIdx = prev.findIndex(
                (m) =>
                  m.id.startsWith('opt-') &&
                  m.senderId === incomingMsg.senderId &&
                  m.text === incomingMsg.text
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

  // Send message handler with 0ms instant optimistic update (zero lag after 4 messages)
  const handleSendMessage = async (text: string, replyTo?: ChatMessage['replyTo']) => {
    if (!text.trim()) return;

    const activeId = tabAuthorIdRef.current || tabAuthorId || `tab_${Date.now()}`;
    const trimmedText = text.trim();
    const tempId = `opt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const optimisticMsg: ChatMessage = {
      id: tempId,
      senderId: activeId,
      senderName: 'Author',
      text: trimmedText,
      timestamp: Date.now(),
      replyTo,
    };

    // Instant 0ms UI update: message appears immediately, sliding the 4-slot window with zero delay
    setMessages((prev) => {
      const updated = [...prev, optimisticMsg];
      return updated.slice(-4);
    });

    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          senderId: activeId,
          senderName: 'Author',
          text: trimmedText,
          password: roomPassword,
          replyTo,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 401) {
          setIsUnlocked(false);
          setShowPasswordModal(true);
        } else {
          console.error('Failed to send:', data.error);
        }
      }
    } catch (err) {
      console.error('Network error sending message:', err);
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
      className={`flex flex-col h-screen w-screen overflow-hidden select-none transition-colors ${
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
          onEnableEditing={() => setShowPasswordModal(true)}
        />
      )}

      {/* 4. MS Word Ruler */}
      <WordRuler darkMode={darkMode} />

      {/* 5. Document Canvas (A4 sheet, 4 messages max, inline enter typing) */}
      <div
        className="flex-1 flex overflow-hidden"
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
          onRequireUnlock={() => setShowPasswordModal(true)}
          onPanicClear={handlePanicLock}
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
      />
    </div>
  );
}
