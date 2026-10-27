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
import { VideoPreviewModal } from '@/components/VideoPreviewModal';
import { ChatMessage, sortChatMessages, WebRTCSignal } from '@/lib/chatStore';
import { Eye, X } from 'lucide-react';

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

  // Strictly chronological sort: oldest at top (Clause 5.1), newest at bottom (Clause 5.4)
  const sorted = Array.from(map.values())
    .sort(sortChatMessages)
    .slice(-4); // Strictly maintain last 4 messages across both authors

  if (sorted.length !== prev.length) {
    changed = true;
  }

  return { next: sorted, changed };
}

export default function WordChatApp() {
  // Session & Identity: Distinct author identity per tab / window (Author 1 vs Author 2)
  const [tabAuthorId, setTabAuthorId] = useState<string>('author-1');
  const tabAuthorIdRef = useRef<string>('author-1');
  const markedSeenIdsRef = useRef<Set<string>>(new Set());
  const isSseConnectedRef = useRef<boolean>(false);
  const sentMsgIdsRef = useRef<Set<string>>(new Set());
  const notifiedMsgIdsRef = useRef<Set<string>>(new Set());
  const isInitialSyncDoneRef = useRef<boolean>(false);
  const lastSoundPlayedAtRef = useRef<number>(0);

  // Room & Protection
  const [roomId, setRoomId] = useState<string>('default-room');
  const [docTitle, setDocTitle] = useState<string>('AI_Engineer_Architecture_Framework.docx');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [showPasswordModal, setShowPasswordModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [roomPassword, setRoomPassword] = useState<string>('');

  // Secret 12-Minute Cloud AutoSave Pulse (Keeps Render free tier awake between 9 AM and 1 AM)
  const [autoSaveActive, setAutoSaveActive] = useState<boolean>(true);

  // Initialize persistent device identity token (NO EXPIRY, survives reload, auto-logout, and panic wipe)
  useEffect(() => {
    let authorId: 'author-1' | 'author-2' = 'author-1';
    try {
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const urlAuthor = params?.get('author') || params?.get('a');
      const urlRoom = params?.get('room');
      if (urlRoom) {
        setRoomId(urlRoom);
      } else {
        const savedRoom = localStorage.getItem('word_permanent_room_id');
        if (savedRoom) setRoomId(savedRoom);
      }

      const savedAutoSave = localStorage.getItem('word_autosave_keepalive');
      if (savedAutoSave !== null) {
        setAutoSaveActive(savedAutoSave === 'true');
      }

      if (urlAuthor === '2' || urlAuthor === 'author-2') {
        authorId = 'author-2';
      } else if (urlAuthor === '1' || urlAuthor === 'author-1') {
        authorId = 'author-1';
      } else {
        // Retrieve persistent permanent device author token (no expiration)
        const permAuthor = localStorage.getItem('word_permanent_device_author_id');
        if (permAuthor === 'author-1' || permAuthor === 'author-2') {
          authorId = permAuthor;
        } else {
          // Check saved password
          const permPwd = localStorage.getItem('word_permanent_device_password');
          if (permPwd === '222') {
            authorId = 'author-2';
          } else {
            const stored = sessionStorage.getItem('word_tab_author_id');
            if (stored === 'author-1' || stored === 'author-2') {
              authorId = stored;
            } else {
              const storedPwd = sessionStorage.getItem('word_tab_password');
              authorId = storedPwd === '222' ? 'author-2' : 'author-1';
            }
          }
        }
      }
      localStorage.setItem('word_permanent_device_author_id', authorId);
      sessionStorage.setItem('word_tab_author_id', authorId);
    } catch {
      authorId = 'author-1';
    }
    setTabAuthorId(authorId);
    tabAuthorIdRef.current = authorId;
  }, []);

  const toggleAutoSave = useCallback(() => {
    setAutoSaveActive((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('word_autosave_keepalive', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Secret 12-minute keepalive ping: keeps Render cloud server awake during daytime hours
  useEffect(() => {
    if (!autoSaveActive) return;

    const keepAliveInterval = setInterval(() => {
      const activeId = tabAuthorIdRef.current || tabAuthorId || 'author-1';
      const activeRoom = roomId || 'default-room';
      fetch(
        `/api/chat/sync?room=${encodeURIComponent(activeRoom)}&senderId=${encodeURIComponent(activeId)}&keepalive=1&_t=${Date.now()}`
      ).catch(() => {});
    }, 12 * 60 * 1000); // 12 minutes (720,000 ms)

    return () => clearInterval(keepAliveInterval);
  }, [autoSaveActive, roomId, tabAuthorId]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [participantCount, setParticipantCount] = useState<number>(1);
  const [bothUnlocked, setBothUnlocked] = useState<boolean>(false);
  const [peerTyping, setPeerTyping] = useState<boolean>(false);
  const peerTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Video Preview Call States (WebRTC P2P Visual Only, Muted, No Audio)
  const [showPreviewConfirm, setShowPreviewConfirm] = useState<boolean>(false);
  const [incomingPreviewInvite, setIncomingPreviewInvite] = useState<{ from: string } | null>(null);
  const [isPreviewActive, setIsPreviewActive] = useState<boolean>(false);
  const [isInitiator, setIsInitiator] = useState<boolean>(false);
  const [incomingSignal, setIncomingSignal] = useState<WebRTCSignal | null>(null);

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

  // Synchronous lifecycle refs for instant 0ms access without useEffect lag
  const isUnlockedRef = useRef<boolean>(isUnlocked);
  isUnlockedRef.current = isUnlocked;

  const bothUnlockedRef = useRef<boolean>(bothUnlocked);
  bothUnlockedRef.current = bothUnlocked;

  const isPreviewActiveRef = useRef<boolean>(isPreviewActive);
  isPreviewActiveRef.current = isPreviewActive;

  const showPreviewConfirmRef = useRef<boolean>(showPreviewConfirm);
  showPreviewConfirmRef.current = showPreviewConfirm;

  const incomingPreviewInviteRef = useRef<{ from: string } | null>(incomingPreviewInvite);
  incomingPreviewInviteRef.current = incomingPreviewInvite;

  const participantCountRef = useRef<number>(participantCount);
  participantCountRef.current = participantCount;

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

  // Helper to convert base64 VAPID key to Uint8Array for PushManager
  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  // Sync Push Subscription with backend (enables high-urgency lockscreen notifications on mobile)
  const syncPushSubscription = useCallback(async (explicitAuthorId?: string, currentRoom?: string) => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      Notification.permission !== 'granted'
    ) {
      return;
    }

    const resolvedAuthor =
      (explicitAuthorId && explicitAuthorId.trim()) ||
      tabAuthorIdRef.current ||
      tabAuthorId ||
      (typeof window !== 'undefined' ? localStorage.getItem('word_permanent_device_author_id') : null) ||
      (typeof window !== 'undefined' ? sessionStorage.getItem('word_tab_author_id') : null) ||
      'author-1';

    const resolvedRoom = currentRoom || roomId || 'default-room';

    try {
      const reg = await navigator.serviceWorker.ready;
      if (!reg.pushManager) return;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const vapidKey =
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
          'BJoR3CU5b1ewC5Wl_6bivArwSQW3hI_WweyJfqYHEU-3olmFPExu6sHgxOhhsc6GucQ_5NmHa4w30ueVW4Rvdk0';

        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          });
        } catch {
          // If key mismatch or broken push registration, clear and retry
          const existing = await reg.pushManager.getSubscription();
          if (existing) {
            await existing.unsubscribe().catch(() => {});
          }
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          });
        }
      }

      if (sub) {
        await fetch('/api/chat/push-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: resolvedRoom,
            authorId: resolvedAuthor,
            subscription: sub.toJSON(),
          }),
        });
      }
    } catch (err) {
      console.warn('Push subscription notice:', err);
    }
  }, [roomId, tabAuthorId]);

  // Register Service Worker for mobile system notifications, sound, & lockscreen push
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => {
          if (Notification.permission === 'granted') {
            syncPushSubscription(tabAuthorIdRef.current || tabAuthorId, roomId);
          }
        })
        .catch(() => {});
    }
  }, [roomId, tabAuthorId, syncPushSubscription]);

  // Keep push subscription in sync whenever author identity changes
  useEffect(() => {
    if (tabAuthorId && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      syncPushSubscription(tabAuthorId, roomId);
    }
  }, [tabAuthorId, roomId, syncPushSubscription]);

  // Request browser notification permission helper
  const requestNotificationPermission = useCallback(async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        try {
          const res = await Notification.requestPermission();
          if (res === 'granted') {
            syncPushSubscription(tabAuthorIdRef.current || tabAuthorId, roomId);
          }
        } catch {
          // ignore
        }
      } else if (Notification.permission === 'granted') {
        syncPushSubscription(tabAuthorIdRef.current || tabAuthorId, roomId);
      }
    }
  }, [roomId, tabAuthorId, syncPushSubscription]);

  // Trigger non-spam stealth system notification with phone's default chime/vibration
  // ONLY triggered when user is locked in Protected View (!isUnlockedRef.current) or tab is backgrounded
  // AND strictly suppressed when both authors are online on page, in video preview, or actively viewing
  const showWordNotification = useCallback(async () => {
    if (typeof window === 'undefined') return;

    // Suppress notification if both authors are on page, in preview, or user is actively viewing
    const isBothOnPage = bothUnlockedRef.current;
    const isInPreview =
      isPreviewActiveRef.current ||
      showPreviewConfirmRef.current ||
      incomingPreviewInviteRef.current !== null;
    const isActivelyViewing =
      isUnlockedRef.current &&
      typeof document !== 'undefined' &&
      !document.hidden &&
      document.visibilityState === 'visible';

    if (isBothOnPage || isInPreview || isActivelyViewing) {
      return;
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      const notifTitle = 'Document Notice';
      const notifBody = 'New clause updated in working document.';

      // 1. Try Service Worker showNotification (Always ring & vibrate for each incoming clause!)
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.ready;
          if (reg && reg.showNotification) {
            await reg.showNotification(notifTitle, {
              body: notifBody,
              icon: '/file.svg',
              badge: '/file.svg',
              tag: 'doc-notice',
              renotify: true, // Always re-trigger sound & vibration on mobile & desktop
              silent: false, // Ensures notification sound plays
              vibrate: [300, 150, 300],
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
          tag: 'doc-notice',
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

  // Multi-engine notification sound with single-chime guarantee (no double-beep/echo)
  // Fires when user is locked in Protected View (!isUnlocked) or away/minimized (document.hidden)
  // STRICTLY SILENT when both authors are on page, in preview, or actively viewing
  const playNotificationSound = useCallback(() => {
    // Cooldown throttle: Prevent duplicate audio firing within 2.5 seconds
    const now = Date.now();
    if (now - lastSoundPlayedAtRef.current < 2500) {
      return;
    }
    lastSoundPlayedAtRef.current = now;

    // Suppress sound if both authors are on page, in preview, or user is actively viewing
    const isBothOnPage = bothUnlockedRef.current;
    const isInPreview =
      isPreviewActiveRef.current ||
      showPreviewConfirmRef.current ||
      incomingPreviewInviteRef.current !== null;
    const isActivelyViewing =
      isUnlockedRef.current &&
      typeof document !== 'undefined' &&
      !document.hidden &&
      document.visibilityState === 'visible';

    if (isBothOnPage || isInPreview || isActivelyViewing) {
      return;
    }

    // 1. Mobile tactile haptic vibration (when locked on-screen in Protected View)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([200, 100, 200]);
      } catch {
        // ignore
      }
    }

    // 2. Native System Notification with Word disguise (shows on laptop OS and mobile)
    showWordNotification();

    // 3. Play audio chime on laptop (runs even when minimized or backgrounded)
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
  }, [playWebAudioChime, showWordNotification]);

  const playNotificationSoundRef = useRef(playNotificationSound);
  playNotificationSoundRef.current = playNotificationSound;

  // Switch Author role (Author 1 <-> Author 2) for immediate multi-window pair testing
  const switchAuthorRole = useCallback(
    (newRole: 'author-1' | 'author-2') => {
      setTabAuthorId(newRole);
      tabAuthorIdRef.current = newRole;
      if (typeof window !== 'undefined') {
        localStorage.setItem('word_permanent_device_author_id', newRole);
        sessionStorage.setItem('word_tab_author_id', newRole);
        const url = new URL(window.location.href);
        url.searchParams.set('author', newRole === 'author-2' ? '2' : '1');
        window.history.replaceState({}, '', url.toString());
      }
      syncPushSubscription(newRole, roomId);
    },
    [roomId, syncPushSubscription]
  );

  // Check session unlock status on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const activeRoom = params.get('room') || localStorage.getItem('word_permanent_room_id') || 'default-room';
      const unlockedSession = sessionStorage.getItem(`word_unlocked_${activeRoom}`);
      const storedPwd = sessionStorage.getItem('word_tab_password') || localStorage.getItem('word_permanent_device_password');

      if (unlockedSession === 'true' && storedPwd) {
        setIsUnlocked(true);
        setRoomPassword(storedPwd);
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
          setMessages([]); // Clears working draft from screen on auto-logout so document is protected
          setIsPreviewActive(false);
          setShowPreviewConfirm(false);
          setIncomingPreviewInvite(null);
          setIncomingSignal(null);
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem(`word_unlocked_${roomId}`);
            sessionStorage.removeItem('word_tab_password');
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

  // Send WebRTC Signal to Peer Author
  const sendSignal = useCallback(
    async (type: WebRTCSignal['type'], data?: unknown) => {
      const activeId =
        tabAuthorIdRef.current === 'author-2' || tabAuthorId === 'author-2'
          ? 'author-2'
          : 'author-1';
      try {
        await fetch('/api/chat/signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId,
            senderId: activeId,
            password: roomPassword,
            type,
            data,
          }),
        });
      } catch (err) {
        console.error('Signal transmission error:', err);
      }
    },
    [roomId, roomPassword, tabAuthorId]
  );

  // Local Panic Wipe & Logout: Instantly cuts video, wipes messages on THIS device ONLY, and logs out
  // Keeps server messages intact so peer co-author is NOT disrupted and messages can be restored on unlock
  const handleLocalPanicWipe = useCallback(() => {
    // 1. Immediately cut video call if active or confirming or invited
    try {
      sendSignal('preview-end').catch(() => {});
    } catch {
      // ignore
    }
    setIsPreviewActive(false);
    setShowPreviewConfirm(false);
    setIncomingPreviewInvite(null);
    setIncomingSignal(null);
    setShowPasswordModal(false);
    setPeerTyping(false);
    if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);

    // 2. Immediately dismiss soft keyboard and clear text selection to prevent mobile browser hang/zoom freeze
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      sessionStorage.removeItem(`word_unlocked_${roomId}`);
      sessionStorage.removeItem(`word_chat_msgs_${roomId}`);
      sessionStorage.removeItem('word_tab_password');
    }

    // 3. Clear messages on THIS device and lock to Protected View
    setMessages([]);
    setIsUnlocked(false);

    // 4. Notify server of unlocked: false so presence updates (does NOT clear server messages!)
    const activeId = tabAuthorIdRef.current || tabAuthorId;
    fetch(
      `/api/chat/sync?room=${encodeURIComponent(roomId)}&senderId=${encodeURIComponent(activeId)}&unlocked=false&_t=${Date.now()}`
    ).catch(() => {});
  }, [roomId, tabAuthorId, sendSignal]);

  const handlePanicLock = handleLocalPanicWipe;

  // Explicit Room Wipe: When intentionally clearing all messages for both laptops
  const isWipingRoomRef = useRef(false);

  const handleRoomWipe = useCallback(async () => {
    if (isWipingRoomRef.current) return;
    isWipingRoomRef.current = true;

    // 1. Immediately cut video call if active or confirming or invited
    try {
      sendSignal('preview-end').catch(() => {});
    } catch {
      // ignore
    }
    setIsPreviewActive(false);
    setShowPreviewConfirm(false);
    setIncomingPreviewInvite(null);
    setIncomingSignal(null);
    setShowPasswordModal(false);
    setPeerTyping(false);
    if (peerTypingTimeoutRef.current) clearTimeout(peerTypingTimeoutRef.current);

    // 2. Immediately dismiss soft keyboard and clear text selection to prevent mobile browser hang/zoom freeze
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      sessionStorage.removeItem(`word_unlocked_${roomId}`);
      sessionStorage.removeItem(`word_chat_msgs_${roomId}`);
      sessionStorage.removeItem('word_tab_password');
    }

    // 3. Clear state and lock to Protected View
    setMessages([]);
    setIsUnlocked(false);

    // 4. Notify server of unlocked: false & clear messages on database
    const activeId = tabAuthorIdRef.current === 'author-2' ? 'author-2' : 'author-1';
    try {
      fetch(
        `/api/chat/sync?room=${encodeURIComponent(roomId)}&senderId=${encodeURIComponent(activeId)}&unlocked=false&_t=${Date.now()}`
      ).catch(() => {});
      await fetch('/api/chat/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId,
          senderId: activeId,
        }),
      });
    } catch (err) {
      console.error('Room clear error:', err);
    } finally {
      setTimeout(() => {
        isWipingRoomRef.current = false;
      }, 800);
    }
  }, [roomId, sendSignal]);

  // Check if pressed key is dedicated panic key: Window (Meta/OS), Ctrl, Alt, Fn, or Escape
  const isPanicKey = (e: KeyboardEvent): boolean => {
    const key = e.key;
    const code = e.code;
    return (
      key === 'Meta' ||
      key === 'OS' ||
      code === 'MetaLeft' ||
      code === 'MetaRight' ||
      key === 'Control' ||
      code === 'ControlLeft' ||
      code === 'ControlRight' ||
      key === 'Alt' ||
      code === 'AltLeft' ||
      code === 'AltRight' ||
      key === 'Escape' ||
      code === 'Escape' ||
      key === 'Fn' ||
      key === 'FnLock' ||
      code === 'Fn' ||
      code === 'FnLock' ||
      e.ctrlKey ||
      e.altKey ||
      e.metaKey
    );
  };

  // Top-level global panic key interceptor (captures before anything else in window)
  useEffect(() => {
    const handleGlobalPanic = (e: KeyboardEvent) => {
      if (isPanicKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        handleLocalPanicWipe();
      }
    };

    window.addEventListener('keydown', handleGlobalPanic, true);
    return () => window.removeEventListener('keydown', handleGlobalPanic, true);
  }, [handleLocalPanicWipe]);

  // Mobile / Touchscreen Rapid Click/Tap Interceptor (> 2 continuous clicks/taps wipes out and logs out)
  const tapHistoryRef = useRef<number[]>([]);

  useEffect(() => {
    const handleRapidTap = (e: PointerEvent) => {
      // On mobile touch devices, allow normal zooming, pinching, and screen adjustments without accidental panic lock
      if (e.pointerType === 'touch' || !e.isPrimary) return;
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
        // Panic: wipe out messages on THIS device and logout immediately!
        handleLocalPanicWipe();
      }
    };

    window.addEventListener('pointerdown', handleRapidTap, { capture: true, passive: true });
    return () => window.removeEventListener('pointerdown', handleRapidTap, { capture: true });
  }, [handleLocalPanicWipe]);




  const signalListenersRef = useRef<Set<(sig: WebRTCSignal) => void>>(new Set());
  const registerSignalListener = useCallback((listener: (sig: WebRTCSignal) => void) => {
    signalListenersRef.current.add(listener);
    return () => {
      signalListenersRef.current.delete(listener);
    };
  }, []);

  // Handle incoming WebRTC signaling packets
  const handleIncomingSignal = useCallback(
    (sig: WebRTCSignal) => {
      const currentTabId = tabAuthorIdRef.current || tabAuthorId;
      if (sig.senderId === currentTabId) return;

      if (sig.type === 'preview-invite') {
        // Peer requested preview: show Join / Decline prompt ONLY if currently logged in (unlocked) AND not already in preview!
        if (isUnlockedRef.current && !isPreviewActiveRef.current) {
          setIncomingPreviewInvite({ from: sig.senderId });
        } else if (!isUnlockedRef.current) {
          // If co-author is logged out, strictly decline/reject preview invite
          sendSignal('preview-decline').catch(() => {});
        }
      } else if (sig.type === 'preview-decline') {
        setIncomingPreviewInvite(null);
      } else if (sig.type === 'preview-end') {
        setIncomingPreviewInvite(null);
        setIsPreviewActive(false);
      } else if (sig.type === 'typing') {
        const isTyping = Boolean((sig.data as { typing?: boolean })?.typing);
        setPeerTyping(isTyping);
        if (peerTypingTimeoutRef.current) {
          clearTimeout(peerTypingTimeoutRef.current);
        }
        if (isTyping) {
          peerTypingTimeoutRef.current = setTimeout(() => {
            setPeerTyping(false);
          }, 3500);
        }
      }

      // Dispatch to active modal listeners directly without tearing down React trees
      signalListenersRef.current.forEach((listener) => {
        try {
          listener(sig);
        } catch (err) {
          console.error('Error in signal listener:', err);
        }
      });
    },
    [tabAuthorId]
  );

  // Send typing status to peer author
  const handleSendTyping = useCallback(
    (typing: boolean) => {
      sendSignal('typing', { typing }).catch(() => {});
    },
    [sendSignal]
  );

  // Connect to Server-Sent Events (SSE) for real-time updates
  useEffect(() => {
    if (!tabAuthorId) return;

    let eventSource: EventSource | null = null;
    let isMounted = true;

    const connectSSE = () => {
      const sseUrl = `/api/chat/stream?room=${encodeURIComponent(roomId)}&senderId=${encodeURIComponent(tabAuthorId)}`;
      eventSource = new EventSource(sseUrl);

      eventSource.onopen = () => {
        isSseConnectedRef.current = true;
      };

      eventSource.onerror = () => {
        isSseConnectedRef.current = false;
      };

      eventSource.onmessage = (event) => {
        if (!isMounted) return;
        isSseConnectedRef.current = true;
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'init') {
            if (Array.isArray(data.messages) && data.messages.length > 0) {
              if (!isInitialSyncDoneRef.current) {
                data.messages.forEach((m: ChatMessage) => notifiedMsgIdsRef.current.add(m.id));
                isInitialSyncDoneRef.current = true;
              }
              setMessages((prev) => {
                const { next } = mergeAndSortMessages(prev, data.messages);
                return next;
              });
            }
            if (data.clientCount !== undefined) {
              const count = Math.min(2, Math.max(1, Number(data.clientCount) || 1));
              setParticipantCount(count);
            }
            if (data.bothUnlocked !== undefined) {
              setBothUnlocked(Boolean(data.bothUnlocked));
            }
          } else if (data.type === 'message' && (data.message || Array.isArray(data.messages))) {
            lastActivityTime.current = Date.now();
            const incomingMsg: ChatMessage | null = data.message
              ? {
                  ...data.message,
                  status: data.message.status || 'delivered',
                }
              : null;

            const incomingList: ChatMessage[] =
              Array.isArray(data.messages) && data.messages.length > 0
                ? data.messages
                : incomingMsg
                ? [incomingMsg]
                : [];

            // Deduplicate and insert deterministically
            setMessages((prev) => {
              const withoutOpt = prev.filter(
                (m) =>
                  !(
                    incomingList.some((inc) => inc.id === m.id) ||
                    (incomingMsg &&
                      m.senderId === incomingMsg.senderId &&
                      m.text === incomingMsg.text &&
                      (m.status === 'pending' || m.id.startsWith('msg-opt-')))
                  )
              );
              const { next } = mergeAndSortMessages(withoutOpt, incomingList);
              return next;
            });

            if (data.clientCount !== undefined) {
              setParticipantCount(Math.min(2, Math.max(1, Number(data.clientCount) || 1)));
            }

            const incomingSenderId = data.message?.senderId;
            const currentTabId = tabAuthorIdRef.current || tabAuthorId;
            const isFromSelf =
              incomingSenderId === currentTabId ||
              (incomingMsg?.id && sentMsgIdsRef.current.has(incomingMsg.id));

            if (!isFromSelf && incomingMsg?.id) {
              const isAlreadyNotified = notifiedMsgIdsRef.current.has(incomingMsg.id);
              if (!isAlreadyNotified) {
                notifiedMsgIdsRef.current.add(incomingMsg.id);
                setParticipantCount(2);

                const isBothOnPage = bothUnlockedRef.current;
                const isInPreview =
                  isPreviewActiveRef.current ||
                  showPreviewConfirmRef.current ||
                  incomingPreviewInviteRef.current !== null;
                const isActivelyViewing =
                  isUnlockedRef.current &&
                  typeof document !== 'undefined' &&
                  !document.hidden &&
                  document.visibilityState === 'visible';

                // Suppress sound & notifications when both are on page, in preview, or actively viewing
                if (!isBothOnPage && !isInPreview && !isActivelyViewing) {
                  const isUserAwayOrLocked =
                    !isUnlockedRef.current ||
                    (typeof document !== 'undefined' && document.hidden);

                  // Only alert if locked or away
                  if (isUserAwayOrLocked) {
                    if (!isUnlockedRef.current) {
                      setIsFontColorBlinking(true);
                    }
                    playNotificationSoundRef.current();
                  }
                }

                // ONLY mark as seen if the user is unlocked AND actively viewing the document (not screen-locked or in background)

                if (isActivelyViewing) {
                  // If unlocked and active: mark as seen immediately (with deduplication)
                  if (!markedSeenIdsRef.current.has(incomingMsg.id)) {
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
              }
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
            setIsPreviewActive(false);
            setShowPreviewConfirm(false);
            setIncomingPreviewInvite(null);
            if (typeof window !== 'undefined') {
              sessionStorage.removeItem(`word_chat_msgs_${roomId}`);
            }
          } else if (data.type === 'signal' && data.signal) {
            handleIncomingSignal(data.signal);
          } else if (data.type === 'presence') {
            const count = Math.min(2, Math.max(1, Number(data.clientCount) || 1));
            setParticipantCount(count);
            if (data.bothUnlocked !== undefined) {
              setBothUnlocked(Boolean(data.bothUnlocked));
            }
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
      isSseConnectedRef.current = false;
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [roomId, tabAuthorId]);

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

  // Unified Adaptive Sync & Presence Engine (Dramatically cuts network requests & Redis commands)
  useEffect(() => {
    if (!tabAuthorId) return;

    let isMounted = true;
    let syncTimeout: NodeJS.Timeout | null = null;

    const runSync = async () => {
      const activeId = tabAuthorIdRef.current || tabAuthorId;
      if (!activeId || !roomId || !isMounted) return;

      try {
        const res = await fetch(
          `/api/chat/sync?room=${encodeURIComponent(roomId)}&senderId=${encodeURIComponent(activeId)}&unlocked=${isUnlockedRef.current}&_t=${Date.now()}`
        );
        if (res.ok && isMounted) {
          const data = await res.json();
          if (Array.isArray(data?.messages) && data.messages.length > 0) {
            if (!isInitialSyncDoneRef.current) {
              data.messages.forEach((m: ChatMessage) => notifiedMsgIdsRef.current.add(m.id));
              isInitialSyncDoneRef.current = true;
            }

            // Find incoming peer messages that have NOT been notified yet
            const unnotifiedPeerMessages = data.messages.filter(
              (m: ChatMessage) =>
                Boolean(m.id) &&
                m.senderId !== activeId &&
                !sentMsgIdsRef.current.has(m.id) &&
                !notifiedMsgIdsRef.current.has(m.id)
            );

            if (unnotifiedPeerMessages.length > 0) {
              unnotifiedPeerMessages.forEach((m: ChatMessage) => notifiedMsgIdsRef.current.add(m.id));

              const isBothOnPage = bothUnlockedRef.current;
              const isInPreview =
                isPreviewActiveRef.current ||
                showPreviewConfirmRef.current ||
                incomingPreviewInviteRef.current !== null;
              const isActivelyViewing =
                isUnlockedRef.current &&
                typeof document !== 'undefined' &&
                !document.hidden &&
                document.visibilityState === 'visible';

              // Suppress sound & notifications when both are on page, in preview, or actively viewing
              if (!isBothOnPage && !isInPreview && !isActivelyViewing) {
                const isUserAwayOrLocked =
                  !isUnlockedRef.current ||
                  (typeof document !== 'undefined' && document.hidden);

                // Only alert if locked or away
                if (isUserAwayOrLocked) {
                  if (!isUnlockedRef.current) {
                    setIsFontColorBlinking(true);
                  }
                  playNotificationSoundRef.current();
                }
              }
            }

            setMessages((prev) => {
              const { next, changed } = mergeAndSortMessages(prev, data.messages);
              return changed ? next : prev;
            });

            // Mark unread peer messages as seen ONLY when user is unlocked AND actively viewing the visible page
            const isActivelyViewing =
              isUnlockedRef.current &&
              typeof document !== 'undefined' &&
              !document.hidden &&
              document.visibilityState === 'visible';

            if (isActivelyViewing) {
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

          if (Array.isArray(data?.signals) && data.signals.length > 0) {
            data.signals.forEach((sig: WebRTCSignal) => {
              handleIncomingSignal(sig);
            });
          } else if (data?.signal) {
            const sig = data.signal.signal || data.signal;
            handleIncomingSignal(sig);
          }

          if (data?.clientCount !== undefined) {
            setParticipantCount(Math.min(2, Math.max(1, Number(data.clientCount) || 1)));
          }

          if (data?.bothUnlocked !== undefined) {
            setBothUnlocked(Boolean(data.bothUnlocked));
          }
        }
      } catch {
        // ignore offline sync
      } finally {
        if (isMounted) {
          const isCallActiveOrConnecting =
            isPreviewActive || showPreviewConfirm || incomingPreviewInvite !== null;

          let nextDelay = 20000;
          if (isSseConnectedRef.current) {
            if (isCallActiveOrConnecting) {
              nextDelay = 3000;
            } else if (document.hidden) {
              nextDelay = 60000; // 60s when tab is backgrounded
            } else if (!isUnlockedRef.current) {
              nextDelay = 30000; // 30s when locked
            } else {
              nextDelay = 20000; // Active document with SSE: 20s safety heartbeat
            }
          } else {
            // Offline / Disconnected SSE fallback mode:
            if (isCallActiveOrConnecting) {
              nextDelay = 1500;
            } else if (document.hidden) {
              nextDelay = 15000;
            } else if (!isUnlockedRef.current) {
              nextDelay = 10000;
            } else {
              nextDelay = 3500; // 3.5s when chatting without SSE
            }
          }
          syncTimeout = setTimeout(runSync, nextDelay);
        }
      }
    };

    // Immediate 0ms sync on mount
    runSync();

    // Instant sync when tab gains visibility
    const handleVisibility = () => {
      if (!document.hidden && isMounted) {
        if (syncTimeout) clearTimeout(syncTimeout);
        runSync();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      isMounted = false;
      if (syncTimeout) clearTimeout(syncTimeout);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [roomId, tabAuthorId, playNotificationSound, isPreviewActive, showPreviewConfirm, incomingPreviewInvite]);

  // Auto-cut video preview immediately if THIS author logs out
  useEffect(() => {
    if (!isUnlocked && isPreviewActive) {
      try {
        sendSignal('preview-end').catch(() => {});
      } catch {
        // ignore
      }
      setIsPreviewActive(false);
      setShowPreviewConfirm(false);
      setIncomingPreviewInvite(null);
    }
  }, [isUnlocked, isPreviewActive, sendSignal]);

  // Send message handler with 0ms instant optimistic update + acknowledgment tracking
  const handleSendMessage = async (text: string, replyTo?: ChatMessage['replyTo']) => {
    if (!text.trim()) return;

    lastActivityTime.current = Date.now();
    const activeId =
      tabAuthorIdRef.current === 'author-2' || tabAuthorId === 'author-2'
        ? 'author-2'
        : 'author-1';
    const activeName = activeId === 'author-2' ? 'Author 2' : 'Author 1';
    const trimmedText = text.trim();
    // Unique deterministic message ID generated upfront
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Record upfront so sender tab NEVER plays notification sound for its own message
    sentMsgIdsRef.current.add(messageId);
    notifiedMsgIdsRef.current.add(messageId);

    const optimisticMsg: ChatMessage = {
      id: messageId,
      senderId: activeId,
      senderName: activeName,
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
          senderName: activeName,
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
        const authenticatedAuthorId = data.authorId || tabAuthorId;
        setTabAuthorId(authenticatedAuthorId);
        tabAuthorIdRef.current = authenticatedAuthorId;
        lastActivityTime.current = Date.now();
        if (typeof window !== 'undefined') {
          // Permanently remember this device's author token (NO EXPIRY, updates if new password used)
          localStorage.setItem('word_permanent_device_author_id', authenticatedAuthorId);
          localStorage.setItem('word_permanent_device_password', pwdAttempt);
          localStorage.setItem('word_permanent_room_id', roomId);

          sessionStorage.setItem('word_tab_author_id', authenticatedAuthorId);
          sessionStorage.setItem('word_tab_password', pwdAttempt);
          sessionStorage.setItem(`word_unlocked_${roomId}`, 'true');
        }
        syncPushSubscription(authenticatedAuthorId, roomId);
        if (data.messages) {
          setMessages(data.messages.slice(-4));
          const activeId = authenticatedAuthorId;
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
      setMessages([]);
      setIsPreviewActive(false);
      setShowPreviewConfirm(false);
      setIncomingPreviewInvite(null);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(`word_unlocked_${roomId}`);
        sessionStorage.removeItem('word_tab_password');
      }
      const activeId = tabAuthorIdRef.current || tabAuthorId;
      fetch(
        `/api/chat/sync?room=${encodeURIComponent(roomId)}&senderId=${encodeURIComponent(activeId)}&unlocked=false&_t=${Date.now()}`
      ).catch(() => {});
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
        currentAuthorId={tabAuthorId}
        onOpenSettings={() => setShowSettingsModal(true)}
        onLockToggle={handleLockToggle}
        onPanic={handlePanicLock}
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
        isSaving={messages.some((m) => m.status === 'pending')}
        autoSaveActive={autoSaveActive}
        onToggleAutoSave={toggleAutoSave}
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

      {/* Real-time Top Notification Banner for Incoming Preview Invite */}
      {incomingPreviewInvite && !isPreviewActive && (
        <div className="bg-[#107c41] text-white px-4 py-2 flex items-center justify-between text-xs shadow-md border-b border-[#0e6b37] z-30 shrink-0 select-none animate-in slide-in-from-top duration-200">
          <div className="flex items-center space-x-2">
            <Eye className="w-4 h-4 animate-pulse text-emerald-200" />
            <span className="font-semibold">
              Co-author ({incomingPreviewInvite.from === 'author-2' ? 'Author 2' : 'Author 1'}) has started Document Preview.
            </span>
            <span className="text-white/80 hidden sm:inline">&bull; Visual only (Audio muted)</span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                setIncomingPreviewInvite(null);
                setIsInitiator(false);
                setIsPreviewActive(true);
              }}
              className="px-3 py-1 bg-white text-[#107c41] hover:bg-emerald-50 rounded text-xs font-bold transition shadow-xs cursor-pointer"
            >
              Join Preview
            </button>
            <button
              onClick={() => {
                sendSignal('preview-decline');
                setIncomingPreviewInvite(null);
              }}
              className="px-2.5 py-1 bg-black/20 hover:bg-black/30 text-white rounded text-xs font-medium transition cursor-pointer"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* 4. MS Word Ruler */}
      <WordRuler darkMode={darkMode} />

      {/* 5. Document Canvas (A4 sheet, 4 messages max, inline enter typing) */}
      <div className="flex-1 flex flex-col h-full min-h-0 w-full min-w-0 overflow-auto">
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
          onPanicClear={handleLocalPanicWipe}
          onPanicWipe={handleLocalPanicWipe}
          peerTyping={peerTyping}
          participantCount={participantCount}
          bothUnlocked={bothUnlocked}
          onTyping={handleSendTyping}
          onOpenPreview={() => {
            if (participantCount >= 2 && bothUnlocked) {
              setShowPreviewConfirm(true);
            }
          }}
          incomingPreviewInvite={incomingPreviewInvite}
          onAcceptPreview={() => {
            setIncomingPreviewInvite(null);
            setIsInitiator(false);
            setIsPreviewActive(true);
          }}
          onDeclinePreview={() => {
            sendSignal('preview-decline');
            setIncomingPreviewInvite(null);
          }}
          darkMode={darkMode}
          zoomLevel={zoomLevel}
        />
      </div>

      {/* 6. MS Word Status Bar */}
      <WordStatusBar
        wordCount={wordCount}
        zoomLevel={zoomLevel}
        setZoomLevel={setZoomLevel}
        isUnlocked={isUnlocked}
        currentAuthorId={tabAuthorId}
        onSwitchAuthorRole={switchAuthorRole}
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
        autoSaveActive={autoSaveActive}
        onToggleAutoSave={toggleAutoSave}
      />

      {/* 1. Preview Confirmation Dialog ("Ask Yes or No") */}
      {showPreviewConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[1px] p-4 select-none animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white dark:bg-[#252526] rounded-md shadow-2xl border border-[#c8c6c4] dark:border-[#3e3e42] overflow-hidden text-xs">
            <div className="bg-[#f3f2f1] dark:bg-[#1e1e1e] border-b border-[#e1dfdd] dark:border-[#333] px-3 py-2 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-[#185abd] text-white rounded flex items-center justify-center text-[10px] font-bold">
                  W
                </div>
                <span className="font-semibold text-xs text-[#323130] dark:text-[#f3f4f6]">
                  Document Visual Preview
                </span>
              </div>
              <button
                onClick={() => setShowPreviewConfirm(false)}
                className="p-1 hover:bg-[#e1dfdd] dark:hover:bg-[#333] rounded text-[#605e5c] dark:text-[#9ca3af] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-full border border-blue-200 dark:border-blue-800 shrink-0 text-[#185abd] dark:text-blue-300">
                  <Eye className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-[#201f1e] dark:text-[#f3f4f6] text-xs">
                    Start live visual preview with co-author?
                  </p>
                  <p className="text-[#605e5c] dark:text-[#9ca3af] text-[11px] leading-relaxed">
                    This will open a direct peer-to-peer visual stream. Audio is strictly muted and no notifications will be sounded.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#f3f2f1] dark:border-[#333]">
                <button
                  type="button"
                  onClick={() => {
                    setShowPreviewConfirm(false);
                    setIsInitiator(true);
                    setIsPreviewActive(true);
                  }}
                  className="px-4 py-1.5 bg-[#0078d4] hover:bg-[#106ebe] text-white rounded text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  Yes, Start Preview
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreviewConfirm(false)}
                  className="px-4 py-1.5 bg-[#f3f2f1] hover:bg-[#edebe9] dark:bg-[#333] dark:hover:bg-[#444] text-[#201f1e] dark:text-[#f3f4f6] border border-[#8a8886] rounded text-xs font-medium transition-colors cursor-pointer"
                >
                  No, Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Incoming Preview Request Dialog (Join or Decline) */}
      {isUnlocked && incomingPreviewInvite && !isPreviewActive && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 backdrop-blur-[1px] p-4 select-none animate-in fade-in duration-150">
          <div className="w-full max-w-sm bg-white dark:bg-[#252526] rounded-md shadow-2xl border border-[#c8c6c4] dark:border-[#3e3e42] overflow-hidden text-xs">
            <div className="bg-[#185abd] text-white px-3 py-2 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 bg-white/20 rounded flex items-center justify-center text-[10px] font-bold">
                  W
                </div>
                <span className="font-semibold text-xs">
                  Document Preview Request
                </span>
              </div>
              <button
                onClick={() => {
                  sendSignal('preview-decline');
                  setIncomingPreviewInvite(null);
                }}
                className="p-1 hover:bg-white/20 rounded text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-full border border-emerald-200 dark:border-emerald-800 shrink-0 text-emerald-600 dark:text-emerald-400">
                  <Eye className="w-5 h-5 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-[#201f1e] dark:text-[#f3f4f6] text-xs">
                    Co-author ({incomingPreviewInvite.from === 'author-2' ? 'Author 2' : 'Author 1'}) has started Document Preview.
                  </p>
                  <p className="text-[#605e5c] dark:text-[#9ca3af] text-[11px] leading-relaxed">
                    Would you like to join the visual preview? Audio is strictly muted.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#f3f2f1] dark:border-[#333]">
                <button
                  type="button"
                  onClick={() => {
                    setIncomingPreviewInvite(null);
                    setIsInitiator(false);
                    setIsPreviewActive(true);
                  }}
                  className="px-4 py-1.5 bg-[#107c41] hover:bg-[#0e6b37] text-white rounded text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  Join Preview
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sendSignal('preview-decline');
                    setIncomingPreviewInvite(null);
                  }}
                  className="px-4 py-1.5 bg-[#f3f2f1] hover:bg-[#edebe9] dark:bg-[#333] dark:hover:bg-[#444] text-[#201f1e] dark:text-[#f3f4f6] border border-[#8a8886] rounded text-xs font-medium transition-colors cursor-pointer"
                >
                  Decline
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Live Video Preview Modal (WebRTC P2P Visual Stream, strictly muted) */}
      <VideoPreviewModal
        isOpen={isPreviewActive}
        isInitiator={isInitiator}
        currentAuthorId={tabAuthorId === 'author-2' ? 'author-2' : 'author-1'}
        peerAuthorName={tabAuthorId === 'author-2' ? 'Author 1' : 'Author 2'}
        roomId={roomId}
        onClose={() => {
          setIsPreviewActive(false);
          setIsInitiator(false);
        }}
        sendSignal={sendSignal}
        registerSignalListener={registerSignalListener}
        onPanicCutAndWipe={handleLocalPanicWipe}
        peerTyping={peerTyping}
        darkMode={darkMode}
      />
    </div>
  );
}
