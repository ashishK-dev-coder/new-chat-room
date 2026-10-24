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

// Deterministic message sorting (by monotonic seq first, timestamp fallback), deduplication, and strictly last 4 messages
function mergeAndSortMessages(
  prev: ChatMessage[],
  incoming: ChatMessage[]
): { next: ChatMessage[]; changed: boolean } {
  const map = new Map<string, ChatMessage>();

  for (const m of prev) {
    if (m && m.id) {
      map.set(m.id, m);
    }
  }

  let changed = false;

  for (const m of incoming) {
    if (!m || !m.id) continue;
    const existing = map.get(m.id);
    if (!existing) {
      map.set(m.id, m);
      changed = true;
    } else {
      // Keep higher status progression: seen > delivered > pending
      const statusRank: Record<string, number> = { failed: 0, pending: 1, delivered: 2, seen: 3 };
      const currentRank = statusRank[m.status || 'delivered'] ?? 1;
      const existingRank = statusRank[existing.status || 'delivered'] ?? 1;

      if (
        currentRank > existingRank ||
        existing.status !== m.status ||
        existing.text !== m.text ||
        (!existing.seq && m.seq) ||
        (!existing.seenAt && m.seenAt)
      ) {
        map.set(m.id, {
          ...existing,
          ...m,
          status: currentRank >= existingRank ? m.status : existing.status,
          seq: m.seq || existing.seq,
        });
        changed = true;
      }
    }
  }

  // Strictly sort: confirmed messages by monotonic seq ascending; pending optimistic at the end
  const sorted = Array.from(map.values())
    .sort((a, b) => {
      if (a.seq && b.seq && a.seq !== b.seq) {
        return a.seq - b.seq;
      }
      if (a.seq && !b.seq) return -1;
      if (!a.seq && b.seq) return 1;
      return (a.timestamp || 0) - (b.timestamp || 0);
    })
    .slice(-4); // Strictly maintain last 4 messages across both authors

  if (sorted.length !== prev.length) {
    changed = true;
  }

  return { next: sorted, changed };
}

export default function WordChatApp() {
  // Session & Identity: Distinct author identity per tab / window (Author 1 vs Author 2)
  const [tabAuthorId, setTabAuthorId] = useState<string>('');
  const tabAuthorIdRef = useRef<string>('');
  const markedSeenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Generate or retrieve stable unique author ID per tab / window
    // Uses sessionStorage so two tabs on same device/browser are recognized as distinct Author 1 and Author 2
    let authorId: string | null = null;
    try {
      authorId = sessionStorage.getItem('word_tab_author_id');
      if (!authorId) {
        authorId = `author_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        sessionStorage.setItem('word_tab_author_id', authorId);
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
        // 1. Prime Web Audio Context
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
        }

        // 2. Prime HTML5 Audio element (Required by mobile Chrome & Safari autoplay policy)
        if (audioElRef.current) {
          const el = audioElRef.current;
          el.volume = 1.0;
          const p = el.play();
          if (p !== undefined) {
            p.then(() => {
              el.pause();
              el.currentTime = 0;
            }).catch(() => {});
          }
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
    showWordNotification();

    // 3. Play HTML5 Audio element
    if (audioElRef.current) {
      try {
        const el = audioElRef.current;
        el.currentTime = 0;
        el.volume = 1.0;
        const playPromise = el.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            playWebAudioChime();
          });
        }
      } catch {
        playWebAudioChime();
      }
    } else {
      playWebAudioChime();
    }

    // 4. Always fire Web Audio chime synthesizer as reliable parallel audio track
    playWebAudioChime();
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
            if (Array.isArray(data.messages) && data.messages.length > 0) {
              setMessages((prev) => {
                const { next } = mergeAndSortMessages(prev, data.messages);
                return next;
              });
            }
            if (data.clientCount !== undefined) {
              const count = Math.min(2, Math.max(1, Number(data.clientCount) || 1));
              setParticipantCount(count);
            }
          } else if (data.type === 'message' && data.message) {
            lastActivityTime.current = Date.now();
            const incomingMsg: ChatMessage = {
              ...data.message,
              status: data.message.status || 'delivered',
            };

            // Deduplicate and insert deterministically
            setMessages((prev) => {
              const withoutOpt = prev.filter(
                (m) =>
                  !(
                    m.senderId === incomingMsg.senderId &&
                    m.text === incomingMsg.text &&
                    (m.status === 'pending' || m.id.startsWith('msg-opt-'))
                  )
              );
              const { next } = mergeAndSortMessages(withoutOpt, [incomingMsg]);
              return next;
            });

            if (data.clientCount !== undefined) {
              setParticipantCount(Math.min(2, Math.max(1, Number(data.clientCount) || 1)));
            }

            const incomingSenderId = data.message?.senderId;
            const currentTabId = tabAuthorIdRef.current;
            const isFromOtherAuthor = incomingSenderId && incomingSenderId !== currentTabId;

            if (isFromOtherAuthor) {
              setParticipantCount(2);

              // 1. If currently locked: activate subtle font color icon blink
              if (!isUnlockedRef.current) {
                setIsFontColorBlinking(true);
              } else {
                // If unlocked: mark as seen immediately (with deduplication)
                if (incomingMsg.id && !markedSeenIdsRef.current.has(incomingMsg.id)) {
                  markedSeenIdsRef.current.add(incomingMsg.id);
                  fetch('/api/chat/seen', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      roomId,
                      messageIds: [incomingMsg.id],
                      senderId: currentTabId,
                    }),
                  }).catch(() => {
                    markedSeenIdsRef.current.delete(incomingMsg.id);
                  });
                }
              }

              // 2. Play notification sound
              playNotificationSound();
            }
          } else if (data.type === 'seen' && Array.isArray(data.messageIds)) {
            // Update seen status in-place without re-ordering or layout shifting
            data.messageIds.forEach((id: string) => markedSeenIdsRef.current.add(id));
            setMessages((prev) =>
              prev.map((m) =>
                data.messageIds.includes(m.id) ? { ...m, status: 'seen' as const } : m
              )
            );
          } else if (data.type === 'clear') {
            setMessages([]);
            markedSeenIdsRef.current.clear();
            if (typeof window !== 'undefined') {
              sessionStorage.removeItem(`word_chat_msgs_${roomId}`);
            }
          } else if (data.type === 'presence') {
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

  // Active author presence heartbeat: runs immediately (0ms on mount) + 1.2s rapid cycle
  useEffect(() => {
    if (!tabAuthorId) return;

    let isMounted = true;
    const sendPresencePing = async () => {
      const activeId = tabAuthorIdRef.current || tabAuthorId;
      if (!activeId || !roomId || !isMounted) return;

      try {
        const res = await fetch('/api/chat/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId, senderId: activeId }),
        });
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data?.clientCount !== undefined) {
            setParticipantCount(Math.min(2, Math.max(1, Number(data.clientCount) || 1)));
          }
        }
      } catch {
        // ignore offline ping
      }
    };

    // Immediate 0ms ping on tab load (instant Author 2 online detection!)
    sendPresencePing();

    const interval = setInterval(sendPresencePing, 1200);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [roomId, tabAuthorId]);

  // Fast Sync Poller: runs continuously to guarantee delivery & plays notification sound
  useEffect(() => {
    if (!tabAuthorId) return;

    let isMounted = true;
    const pollSync = async () => {
      try {
        const activeId = tabAuthorIdRef.current || tabAuthorId;
        const res = await fetch(
          `/api/chat/sync?room=${encodeURIComponent(roomId)}&senderId=${encodeURIComponent(activeId)}&_t=${Date.now()}`
        );
        if (res.ok && isMounted) {
          const data = await res.json();
          if (Array.isArray(data?.messages) && data.messages.length > 0) {
            // Check if there are new incoming peer messages to play notification sound
            setMessages((prev) => {
              const hasNewPeerMsg = data.messages.some(
                (m: ChatMessage) =>
                  m.senderId !== activeId && !prev.some((p) => p.id === m.id)
              );

              if (hasNewPeerMsg) {
                if (!isUnlockedRef.current) {
                  setIsFontColorBlinking(true);
                }
                playNotificationSound();
              }

              const { next, changed } = mergeAndSortMessages(prev, data.messages);
              return changed ? next : prev;
            });

            // Mark unread peer messages as seen with deduplication
            if (isUnlockedRef.current) {
              const unreadIds: string[] = data.messages
                .filter(
                  (m: ChatMessage) =>
                    Boolean(m.id) &&
                    m.senderId !== activeId &&
                    m.status !== 'seen' &&
                    !markedSeenIdsRef.current.has(m.id)
                )
                .map((m: ChatMessage) => m.id);

              if (unreadIds.length > 0) {
                unreadIds.forEach((id: string) => markedSeenIdsRef.current.add(id));
                fetch('/api/chat/seen', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    roomId,
                    messageIds: unreadIds,
                    senderId: activeId,
                  }),
                }).catch(() => {
                  unreadIds.forEach((id: string) => markedSeenIdsRef.current.delete(id));
                });
              }
            }
          }
          if (data?.clientCount !== undefined) {
            setParticipantCount(Math.min(2, Math.max(1, Number(data.clientCount) || 1)));
          }
        }
      } catch {
        // ignore offline sync
      }
    };

    const pollIntervalTime = isUnlocked ? 600 : 2000;
    const interval = setInterval(pollSync, pollIntervalTime);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isUnlocked, roomId, tabAuthorId, playNotificationSound]);

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
      const { next } = mergeAndSortMessages(prev, [optimisticMsg]);
      return next;
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
        // Confirmed & acknowledged by server! Merge with server-confirmed seq number
        const data = await res.json().catch(() => ({}));
        if (data?.message) {
          setMessages((prev) => {
            const { next } = mergeAndSortMessages(prev, [data.message]);
            return next;
          });
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId ? { ...m, status: 'delivered' } : m
            )
          );
        }
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
          const activeId = tabAuthorIdRef.current || tabAuthorId;
          const peerUnread = data.messages
            .filter((m: ChatMessage) => m.senderId !== activeId && m.status !== 'seen')
            .map((m: ChatMessage) => m.id);
          if (peerUnread.length > 0) {
            fetch('/api/chat/seen', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                roomId,
                messageIds: peerUnread,
                senderId: activeId,
              }),
            }).catch(() => {});
          }
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
        className="flex-1 flex flex-col h-full min-h-0 w-full min-w-0 overflow-hidden"
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

      {/* Preloaded hidden HTML5 audio element for notification chime */}
      <audio
        ref={audioElRef}
        src="/sounds/chime.wav"
        preload="auto"
        playsInline
      />
    </div>
  );
}
