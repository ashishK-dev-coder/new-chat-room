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
  // Session & Identity: Each browser tab gets a strictly unique in-memory ID
  const [tabAuthorId, setTabAuthorId] = useState<string>('');
  const tabAuthorIdRef = useRef<string>('');

  useEffect(() => {
    // Generate unique ID in memory for this tab instance
    const uniqueId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    setTabAuthorId(uniqueId);
    tabAuthorIdRef.current = uniqueId;
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
        if (audioElRef.current) {
          audioElRef.current.load();
        }

        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
            audioCtxRef.current = new AudioCtx();
          }
          if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume().catch(() => {});
          }
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener('click', primeAudio, { passive: true });
    window.addEventListener('keydown', primeAudio, { passive: true });
    return () => {
      window.removeEventListener('click', primeAudio);
      window.removeEventListener('keydown', primeAudio);
    };
  }, []);

  // Web Audio chime synthesizer (guaranteed fallback)
  const playWebAudioChime = useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      let ctx = audioCtxRef.current;
      if (!ctx || ctx.state === 'closed') {
        ctx = new AudioCtx();
        audioCtxRef.current = ctx;
      }

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Triangle wave has clear, audible presence
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.1); // A5

      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.42);
    } catch {
      // ignore
    }
  }, []);

  // Dual-engine notification sound player (HTML5 Audio + Web Audio fallback)
  const playNotificationSound = useCallback(() => {
    let playedHtml5 = false;

    // 1. Try DOM preloaded audio element
    if (audioElRef.current) {
      try {
        audioElRef.current.currentTime = 0;
        audioElRef.current.volume = 0.9;
        const playPromise = audioElRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              playedHtml5 = true;
            })
            .catch(() => {
              playWebAudioChime();
            });
        }
      } catch {
        playWebAudioChime();
      }
    }

    // 2. Also run Web Audio chime to ensure crisp, unmistakable notification sound
    setTimeout(() => {
      if (!playedHtml5) {
        playWebAudioChime();
      }
    }, 50);
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

  // Panic Wipe: Clears chat messages AND logs out immediately with NO popup
  const handlePanicClear = useCallback(async () => {
    setMessages([]);
    setIsUnlocked(false);
    setShowPasswordModal(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(`word_unlocked_${roomId}`);
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
      console.error('Background clear error:', err);
    }
  }, [roomId]);

  // Check if pressed key is Ctrl, Alt, Window (Meta), Fn, or Escape
  const isPanicKey = (e: KeyboardEvent): boolean => {
    const key = e.key;
    const code = e.code;
    return (
      key === 'Control' ||
      code === 'ControlLeft' ||
      code === 'ControlRight' ||
      key === 'Alt' ||
      key === 'AltGraph' ||
      code === 'AltLeft' ||
      code === 'AltRight' ||
      key === 'Meta' ||
      key === 'OS' ||
      code === 'MetaLeft' ||
      code === 'MetaRight' ||
      key === 'Fn' ||
      key === 'FnLock' ||
      code === 'Fn' ||
      code === 'FnLock' ||
      key === 'Escape' ||
      code === 'Escape'
    );
  };

  // Top-level global panic key interceptor (captures before anything else)
  useEffect(() => {
    const handleGlobalPanic = (e: KeyboardEvent) => {
      if (isPanicKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        setShowPasswordModal(false);
        handlePanicClear();
      }
    };

    window.addEventListener('keydown', handleGlobalPanic, true);
    return () => window.removeEventListener('keydown', handleGlobalPanic, true);
  }, [handlePanicClear]);

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
            setMessages((data.messages || []).slice(-4));
          } else if (data.type === 'message') {
            // Append incoming message and keep ONLY latest 4
            setMessages((prev) => {
              const updated = [...prev, data.message];
              return updated.slice(-4);
            });

            // When this tab is logged out: EVERY incoming message triggers blinking 'A' and sound!
            if (!isUnlockedRef.current) {
              setIsFontColorBlinking(true);
              playNotificationSound();
            }
          } else if (data.type === 'clear') {
            setMessages([]);
          } else if (data.type === 'presence') {
            setParticipantCount(data.clientCount || 1);
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

  // Send message handler
  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;

    const activeId = tabAuthorIdRef.current || tabAuthorId || `tab_${Date.now()}`;

    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          senderId: activeId,
          senderName: 'Author',
          text,
          password: roomPassword,
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
        className="hidden"
      />

      {/* 1. MS Word Title Bar */}
      <WordTitleBar
        docTitle={docTitle}
        isUnlocked={isUnlocked}
        participantCount={participantCount}
        onOpenSettings={() => setShowSettingsModal(true)}
        onLockToggle={handleLockToggle}
        onPanic={handlePanicClear}
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
      />

      {/* 2. MS Word Ribbon (Tabs + Toolbars) */}
      <WordRibbon
        fontSettings={fontSettings}
        setFontSettings={setFontSettings}
        onOpenFileMenu={() => setShowSettingsModal(true)}
        onPanicClear={handlePanicClear}
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
          onPanicClear={handlePanicClear}
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
        onPanicClear={handlePanicClear}
        currentPassword={roomPassword}
        setCurrentPassword={setRoomPassword}
      />
    </div>
  );
}
