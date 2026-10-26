import { getRedisClient, isRedisWritable, markRedisNonWritable } from './redis';

// Ephemeral store for strictly 2-person real-time chat with optional Upstash Redis Pub/Sub support
export interface ChatMessage {
  id: string;
  seq?: number;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  status?: 'pending' | 'delivered' | 'seen' | 'failed';
  seenAt?: number;
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
  };
}

// Canonical chronological message sorting:
// Oldest messages on TOP (smaller timestamp), newest messages at the BOTTOM (larger timestamp).
// Guarantees new messages NEVER jump to the top or get inverted.
export function sortChatMessages(a: ChatMessage, b: ChatMessage): number {
  const seqA = a.seq || 0;
  const seqB = b.seq || 0;
  if (seqA && seqB && seqA !== seqB) {
    return seqA - seqB; // Strictly chronological by server sequence assignment
  }
  const timeA = a.timestamp || 0;
  const timeB = b.timestamp || 0;
  if (timeA !== timeB) {
    return timeA - timeB; // Strictly chronological fallback
  }
  return (a.id || '').localeCompare(b.id || '');
}

export interface ClientSubscriber {
  id: string;
  senderId: string;
  send: (data: string) => boolean;
}

export interface RoomState {
  roomId: string;
  messages: ChatMessage[];
  clients: Map<string, ClientSubscriber>; // connectionId -> subscriber
  authorHeartbeats: Map<string, number>; // senderId -> lastTimestamp
  unlockedAuthors: Set<string>; // senderId -> isUnlocked (strictly logged in)
  seqCounter?: number;
  lastRedisFetchTime?: number; // In-memory TTL throttle to save thousands of Redis read calls
  pendingSignals?: Map<string, WebRTCSignal[]>; // targetAuthorId -> WebRTCSignal[]
}

// Global variable across hot reloads in development
declare global {
  // eslint-disable-next-line no-var
  var __wordChatRooms: Map<string, RoomState> | undefined;
}

const rooms: Map<string, RoomState> = global.__wordChatRooms || new Map<string, RoomState>();
if (process.env.NODE_ENV !== 'production') {
  global.__wordChatRooms = rooms;
}

const MAX_MESSAGES = 4; // strictly maintain at most 4 messages (oldest automatically pruned and removed)
const MAX_AUTHORS = 2; // strictly 2-person chat room
const HEARTBEAT_TIMEOUT_MS = 30000; // 30 seconds threshold for active presence without flickering


export function getOrCreateRoom(roomId: string): RoomState {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      roomId,
      messages: [],
      clients: new Map(),
      authorHeartbeats: new Map(),
      unlockedAuthors: new Set(),
      pendingSignals: new Map(),
    };
    rooms.set(roomId, room);
  }
  if (!room.authorHeartbeats) {
    room.authorHeartbeats = new Map();
  }
  if (!room.unlockedAuthors) {
    room.unlockedAuthors = new Set();
  }
  if (!room.pendingSignals) {
    room.pendingSignals = new Map();
  }
  return room;
}

// Track logged-in (unlocked) status of authors
export function setAuthorUnlockedStatus(
  roomId: string,
  authorId: string,
  unlocked: boolean
): { bothUnlocked: boolean; unlockedCount: number } {
  const room = getOrCreateRoom(roomId);
  if (unlocked) {
    room.unlockedAuthors.add(authorId);
  } else {
    room.unlockedAuthors.delete(authorId);
  }
  broadcastPresence(room);
  return {
    bothUnlocked: isBothAuthorsUnlocked(room),
    unlockedCount: room.unlockedAuthors.size,
  };
}

// Synchronize author presence across serverless Lambdas using Redis with automatic TTL expiry
export async function syncAuthorPresenceAsync(
  roomId: string,
  authorId: string,
  unlocked: boolean
): Promise<{ bothUnlocked: boolean; clientCount: number; unlockedCount: number }> {
  const room = getOrCreateRoom(roomId);
  if (unlocked) {
    room.unlockedAuthors.add(authorId);
  } else {
    room.unlockedAuthors.delete(authorId);
  }
  room.authorHeartbeats.set(authorId, Date.now());

  // Direct 0ms in-memory presence calculation (Single persistent Node.js process)
  const bothUnlocked = isBothAuthorsUnlocked(room);
  const unlockedCount = room.unlockedAuthors.size;
  const clientCount = getActiveAuthorCount(room);

  // Background non-blocking Redis presence sync (never stalls the HTTP response)
  const redis = getRedisClient();
  if (redis && isRedisWritable()) {
    const presenceKey = `room:${roomId}:presence:${authorId}`;
    if (unlocked) {
      redis.set(presenceKey, '1', { ex: 35 }).catch(markRedisNonWritable);
    } else {
      redis.del(presenceKey).catch(markRedisNonWritable);
    }
  }

  return { bothUnlocked, clientCount, unlockedCount };
}

export function isBothAuthorsUnlocked(room: RoomState): boolean {
  if (!room.unlockedAuthors) return false;
  const activeIds = getActiveAuthorIds(room);
  return (
    activeIds.has('author-1') &&
    activeIds.has('author-2') &&
    room.unlockedAuthors.has('author-1') &&
    room.unlockedAuthors.has('author-2')
  );
}

export function getUnlockedAuthorCount(room: RoomState): number {
  return room.unlockedAuthors ? room.unlockedAuthors.size : 0;
}

// Record an author heartbeat timestamp and prune expired sessions
export function recordAuthorHeartbeat(roomId: string, senderId: string): number {
  const room = getOrCreateRoom(roomId);
  const prevCount = getActiveAuthorCount(room);
  room.authorHeartbeats.set(senderId, Date.now());
  const count = getActiveAuthorCount(room);

  // If author count changes (e.g. 1 -> 2 authors), broadcast immediately over SSE
  if (count !== prevCount) {
    broadcastPresence(room);
  }

  return count;
}

// Explicitly and instantly remove an author who closed the tab or left the page
export function removeAuthorFromRoom(roomId: string, senderId: string): void {
  const room = getOrCreateRoom(roomId);

  // 1. Remove from heartbeats & unlocked sessions
  if (room.authorHeartbeats) {
    room.authorHeartbeats.delete(senderId);
  }
  if (room.unlockedAuthors) {
    room.unlockedAuthors.delete(senderId);
  }

  // 2. Remove all SSE client connections associated with this author
  const connIdsToRemove: string[] = [];
  room.clients.forEach((sub, id) => {
    if (sub.senderId === senderId) {
      connIdsToRemove.push(id);
    }
  });
  connIdsToRemove.forEach((id) => room.clients.delete(id));

  // 3. Clear Redis presence immediately
  const redis = getRedisClient();
  if (redis && isRedisWritable()) {
    redis.del(`room:${roomId}:presence:${senderId}`).catch(markRedisNonWritable);
  }

  // 4. Immediately broadcast updated presence
  broadcastPresence(room);
}

// Get set of unique active author IDs in the room based on currently open SSE connections & live heartbeats
export function getActiveAuthorIds(room: RoomState): Set<string> {
  const now = Date.now();
  const ids = new Set<string>();

  // 1. Any currently open SSE client connection is actively connected
  room.clients.forEach((sub) => {
    if (sub.senderId) {
      ids.add(sub.senderId);
    }
  });

  // 2. Any author with a recent heartbeat within HEARTBEAT_TIMEOUT_MS (30s) is considered active
  if (room.authorHeartbeats) {
    const expiredAuthors: string[] = [];
    room.authorHeartbeats.forEach((lastBeat, senderId) => {
      if (now - lastBeat <= HEARTBEAT_TIMEOUT_MS) {
        ids.add(senderId);
      } else {
        // Only expire if this author does NOT have an open SSE connection
        let hasActiveSSE = false;
        room.clients.forEach((sub) => {
          if (sub.senderId === senderId) hasActiveSSE = true;
        });
        if (!hasActiveSSE) {
          expiredAuthors.push(senderId);
        }
      }
    });
    expiredAuthors.forEach((sid) => {
      room.authorHeartbeats?.delete(sid);
      room.unlockedAuthors?.delete(sid);
    });
  }

  return ids;
}

// Get active author count (strictly clamped between 1 and 2)
export function getActiveAuthorCount(room: RoomState): number {
  const uniqueAuthors = getActiveAuthorIds(room);
  return Math.min(MAX_AUTHORS, Math.max(1, uniqueAuthors.size));
}

// Allow authors in this secret room without artificial blocking
export function canAuthorParticipate(_roomId: string, _senderId: string): boolean {
  return true;
}

// Broadcast presence count strictly to all connected clients
export function broadcastPresence(room: RoomState) {
  const clampedCount = getActiveAuthorCount(room);
  const bothUnlocked = isBothAuthorsUnlocked(room);
  const unlockedCount = getUnlockedAuthorCount(room);

  const payload = JSON.stringify({
    type: 'presence',
    clientCount: clampedCount,
    bothUnlocked,
    unlockedCount,
    timestamp: Date.now(),
  });

  const deadIds: string[] = [];
  room.clients.forEach((sub, id) => {
    try {
      const ok = sub.send(`data: ${payload}\n\n`);
      if (!ok) {
        deadIds.push(id);
      }
    } catch {
      deadIds.push(id);
    }
  });

  deadIds.forEach((id) => room.clients.delete(id));
}

// Subscribe client to room SSE events with strict 2-person limit
export function subscribeToRoom(
  roomId: string,
  senderId: string,
  sendFn: (data: string) => boolean
): { unsubscribe: () => void; allowed: boolean } {
  const room = getOrCreateRoom(roomId);

  const connId = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const subscriber: ClientSubscriber = {
    id: connId,
    senderId,
    send: sendFn,
  };

  room.clients.set(connId, subscriber);
  room.authorHeartbeats.set(senderId, Date.now());

  // Broadcast presence count to all connected clients (e.g. updates from 1 Author to 2 Authors)
  broadcastPresence(room);

  return {
    allowed: true,
    unsubscribe: () => {
      room.clients.delete(connId);
      // If this author has no other tabs open in this room, remove their heartbeat immediately
      let hasOtherConn = false;
      room.clients.forEach((sub) => {
        if (sub.senderId === senderId) hasOtherConn = true;
      });
      if (!hasOtherConn && room.authorHeartbeats) {
        room.authorHeartbeats.delete(senderId);
      }
      // Immediately notify remaining client of updated count
      broadcastPresence(room);
    },
  };
}

// Add message with strict 4-message ceiling, atomic seq counter, and 2-person room enforcement
// OPTIMIZED: Exactly 1 single Redis command (SET) per sent message
export async function addMessageToRoom(
  roomId: string,
  message: {
    id?: string;
    senderId: string;
    senderName: string;
    text: string;
    status?: 'pending' | 'delivered' | 'failed';
    replyTo?: {
      id: string;
      senderName: string;
      text: string;
    };
  }
): Promise<{ success: boolean; messages: ChatMessage[]; message?: ChatMessage; error?: string }> {
  const room = getOrCreateRoom(roomId);
  const redis = getRedisClient();

  // Cold-start sync: Only read from Redis if memory is completely empty (e.g. fresh serverless container)
  if (room.messages.length === 0 && redis) {
    try {
      const stored = await redis.get<string | ChatMessage[]>(`room:${roomId}:messages`);
      if (stored) {
        const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
        if (Array.isArray(parsed) && parsed.length > 0) {
          room.messages = parsed;
          const maxSeq = parsed.reduce((max, m) => Math.max(max, m.seq || 0), 0);
          room.seqCounter = Math.max(room.seqCounter || 0, maxSeq);
        }
      }
    } catch {
      // fallback to memory
    }
  }

  // Monotonically increasing sequence counter without an extra Redis INCR command
  const currentMaxSeq = room.messages.reduce((max, m) => Math.max(max, m.seq || 0), 0);
  const nextSeq = Math.max(room.seqCounter || 0, currentMaxSeq) + 1;
  room.seqCounter = nextSeq;

  const newMsg: ChatMessage = {
    id: message.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    seq: nextSeq,
    senderId: message.senderId,
    senderName: message.senderName || 'Anonymous',
    text: message.text,
    timestamp: Date.now(),
    status: 'delivered', // Acknowledged on server
    replyTo: message.replyTo,
  };

  // Deduplicate and push
  const exists = room.messages.some((m) => m.id === newMsg.id);
  if (!exists) {
    room.messages.push(newMsg);
  } else {
    room.messages = room.messages.map((m) => (m.id === newMsg.id ? { ...m, ...newMsg } : m));
  }

  // Strictly chronological: oldest at top, newest at bottom, keeping strictly last 4
  room.messages = room.messages.sort(sortChatMessages).slice(-MAX_MESSAGES);

  const authorCount = getActiveAuthorCount(room);

  // Broadcast to all connected clients including current participant count (0ms instant delivery over SSE)
  const payload = JSON.stringify({
    type: 'message',
    message: newMsg,
    messages: room.messages,
    clientCount: authorCount,
  });

  const deadIds: string[] = [];
  room.clients.forEach((sub, id) => {
    try {
      const ok = sub.send(`data: ${payload}\n\n`);
      if (!ok) {
        deadIds.push(id);
      }
    } catch {
      deadIds.push(id);
    }
  });

  deadIds.forEach((id) => room.clients.delete(id));

  // Sync to Redis with 1 single command (SET), updating server cache timestamp
  room.lastRedisFetchTime = Date.now();
  if (redis && isRedisWritable()) {
    redis.set(`room:${roomId}:messages`, JSON.stringify(room.messages), { ex: 86400 }).catch(markRedisNonWritable);
  }

  return { success: true, messages: room.messages, message: newMsg };
}

// Mark messages as seen when the co-author opens / reads the document
// OPTIMIZED: Exactly 1 single Redis command (SET) only if a message status actually changed
export async function markMessagesAsSeen(
  roomId: string,
  messageIds: string[],
  seenBy: string
): Promise<{ success: boolean; seenIds: string[] }> {
  const room = getOrCreateRoom(roomId);
  const now = Date.now();
  const seenIds: string[] = [];
  const redis = getRedisClient();

  // Cold-start sync: Only read from Redis if memory is completely empty
  if (room.messages.length === 0 && redis) {
    try {
      const stored = await redis.get<string | ChatMessage[]>(`room:${roomId}:messages`);
      if (stored) {
        const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
        if (Array.isArray(parsed)) {
          room.messages = parsed;
        }
      }
    } catch {
      // fallback
    }
  }

  room.messages = room.messages.map((m) => {
    if (messageIds.includes(m.id) && m.senderId !== seenBy && m.status !== 'seen') {
      seenIds.push(m.id);
      return {
        ...m,
        status: 'seen' as const,
        seenAt: now,
      };
    }
    return m;
  });

  if (seenIds.length > 0) {
    const payload = JSON.stringify({
      type: 'seen',
      messageIds: seenIds,
      seenBy,
      seenAt: now,
    });

    const deadIds: string[] = [];
    room.clients.forEach((sub, id) => {
      try {
        const ok = sub.send(`data: ${payload}\n\n`);
        if (!ok) deadIds.push(id);
      } catch {
        deadIds.push(id);
      }
    });
    deadIds.forEach((id) => room.clients.delete(id));

    // Exactly 1 Redis command (SET)
    room.lastRedisFetchTime = Date.now();
    if (redis && isRedisWritable()) {
      redis.set(`room:${roomId}:messages`, JSON.stringify(room.messages), { ex: 86400 }).catch(markRedisNonWritable);
    }
  }

  return { success: true, seenIds };
}

export function clearRoomMessages(roomId: string, senderId?: string): { success: boolean } {
  const room = getOrCreateRoom(roomId);
  room.messages = [];
  room.seqCounter = 0;
  room.lastRedisFetchTime = Date.now();

  const payload = JSON.stringify({
    type: 'clear',
    clearedBy: senderId || 'panic',
    timestamp: Date.now(),
  });

  const deadIds: string[] = [];
  room.clients.forEach((sub, id) => {
    try {
      const ok = sub.send(`data: ${payload}\n\n`);
      if (!ok) deadIds.push(id);
    } catch {
      deadIds.push(id);
    }
  });

  deadIds.forEach((id) => room.clients.delete(id));

  const redis = getRedisClient();
  if (redis && isRedisWritable()) {
    redis.del(`room:${roomId}:messages`).catch(markRedisNonWritable);
  }

  return { success: true };
}

export function getRoomMessages(roomId: string): ChatMessage[] {
  const room = rooms.get(roomId);
  if (!room) return [];
  return [...room.messages].sort(sortChatMessages).slice(-MAX_MESSAGES);
}

export async function getRoomMessagesAsync(roomId: string): Promise<ChatMessage[]> {
  const room = getOrCreateRoom(roomId);

  // Fast-path: If in-memory store already has messages, serve directly in 0ms!
  // Single persistent Node.js instance on Render keeps room.messages always hot and synchronized.
  if (room.messages && room.messages.length > 0) {
    return getRoomMessages(roomId);
  }

  // Cold start: In-memory store is empty (server just booted or recovered from sleep), load once from Redis
  const redis = getRedisClient();
  if (redis) {
    try {
      const data = await redis.get<string | ChatMessage[]>(`room:${roomId}:messages`);
      if (data) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (Array.isArray(parsed) && parsed.length > 0) {
          room.messages = parsed.sort(sortChatMessages).slice(-MAX_MESSAGES);
          const maxSeq = parsed.reduce((max, m) => Math.max(max, m.seq || 0), 0);
          room.seqCounter = Math.max(room.seqCounter || 0, maxSeq);
          return room.messages;
        }
      }
    } catch {
      // fallback to memory
    }
  }
  return getRoomMessages(roomId);
}

export interface AuthorAuthResult {
  valid: boolean;
  authorId?: 'author-1' | 'author-2';
  authorName?: string;
  error?: string;
}

export function getAuthor1Password(): string {
  return (
    process.env.AUTHOR_1_PASSWORD ||
    process.env.AUTHOR1_PASSWORD ||
    process.env.AUTHOR_1 ||
    '111'
  ).trim();
}

export function getAuthor2Password(): string {
  return (
    process.env.AUTHOR_2_PASSWORD ||
    process.env.AUTHOR2_PASSWORD ||
    process.env.AUTHOR_2 ||
    '222'
  ).trim();
}

// Authenticate and deterministically resolve author role based on password:
// Password for Author 1 (e.g. 111) -> strictly logs in as 'author-1'
// Password for Author 2 (e.g. 222) -> strictly logs in as 'author-2'
export function authenticateAuthor(passwordAttempt: string): AuthorAuthResult {
  const attempt = (passwordAttempt || '').trim();
  const pass1 = getAuthor1Password();
  const pass2 = getAuthor2Password();

  if (attempt && attempt === pass1) {
    return { valid: true, authorId: 'author-1', authorName: 'Author 1' };
  }
  if (attempt && attempt === pass2) {
    return { valid: true, authorId: 'author-2', authorName: 'Author 2' };
  }

  return {
    valid: false,
    error: 'Incorrect author password. Please enter your valid Author 1 or Author 2 password.',
  };
}

export function verifyRoomPassword(_roomId: string, passwordAttempt: string): boolean {
  return authenticateAuthor(passwordAttempt).valid;
}

export interface WebRTCSignal {
  type: 'preview-invite' | 'preview-accept' | 'preview-decline' | 'preview-end' | 'offer' | 'answer' | 'candidate' | 'typing';
  senderId: string;
  targetId?: string;
  data?: unknown;
  timestamp?: number;
}

// In-memory queueing for WebRTC signals to ensure zero signal loss even if SSE is reconnecting
export function queuePendingSignal(roomId: string, targetAuthor: string, signal: WebRTCSignal): void {
  const room = getOrCreateRoom(roomId);
  if (!room.pendingSignals) {
    room.pendingSignals = new Map();
  }
  const existing = room.pendingSignals.get(targetAuthor) || [];
  const now = Date.now();
  const valid = existing.filter((s) => now - (s.timestamp || now) < 30000);
  valid.push({ ...signal, timestamp: now });
  room.pendingSignals.set(targetAuthor, valid.slice(-10));
}

export function popPendingSignals(roomId: string, targetAuthor: string): WebRTCSignal[] {
  const room = getOrCreateRoom(roomId);
  if (!room.pendingSignals) return [];
  const signals = room.pendingSignals.get(targetAuthor) || [];
  if (signals.length > 0) {
    room.pendingSignals.delete(targetAuthor);
  }
  const now = Date.now();
  return signals.filter((s) => now - (s.timestamp || now) < 30000);
}

export function clearPendingSignals(roomId: string): void {
  const room = getOrCreateRoom(roomId);
  if (room.pendingSignals) {
    room.pendingSignals.clear();
  }
}

// Broadcast WebRTC signaling data directly over SSE to the peer author & queue in Redis for cross-container retrieval
export async function broadcastSignal(
  roomId: string,
  signal: WebRTCSignal
): Promise<{ success: boolean; deliveredCount: number }> {
  const room = getOrCreateRoom(roomId);
  const now = Date.now();
  const fullSignal: WebRTCSignal = {
    ...signal,
    timestamp: now,
  };
  const payload = JSON.stringify({
    type: 'signal',
    signal: fullSignal,
  });

  const targetAuthor =
    signal.targetId || (signal.senderId === 'author-2' ? 'author-1' : 'author-2');

  // 1. In-memory queueing for any local listener on this process
  queuePendingSignal(roomId, targetAuthor, fullSignal);

  let deliveredCount = 0;
  const deadIds: string[] = [];

  room.clients.forEach((sub, id) => {
    // Deliver exclusively to the other author or target author
    if (sub.senderId !== signal.senderId || sub.senderId === targetAuthor) {
      try {
        const ok = sub.send(`data: ${payload}\n\n`);
        if (ok) {
          deliveredCount++;
        } else {
          deadIds.push(id);
        }
      } catch {
        deadIds.push(id);
      }
    }
  });

  deadIds.forEach((id) => room.clients.delete(id));

  // 2. Non-blocking asynchronous Redis queueing (never stalls the HTTP response)
  const redis = getRedisClient();
  if (redis && isRedisWritable()) {
    const listKey = `room:${roomId}:signals:${targetAuthor}`;
    if (signal.type === 'preview-end' || signal.type === 'preview-decline') {
      redis.del(listKey).catch(markRedisNonWritable);
      redis.del(`room:${roomId}:signals:${signal.senderId}`).catch(markRedisNonWritable);
      redis.rpush(listKey, JSON.stringify(fullSignal)).catch(markRedisNonWritable);
      redis.expire(listKey, 30).catch(markRedisNonWritable);
    } else {
      redis.rpush(listKey, JSON.stringify(fullSignal)).catch(markRedisNonWritable);
      redis.expire(listKey, 60).catch(markRedisNonWritable);
    }
  }

  return { success: true, deliveredCount };
}

// Retrieve and pop all pending signals across both memory and Redis
export async function popAllSignalsAsync(roomId: string, targetAuthor: string): Promise<WebRTCSignal[]> {
  // 1. Direct fast-path check for in-memory pending signals (0ms RAM access)
  const inMemory = popPendingSignals(roomId, targetAuthor);
  if (inMemory.length > 0) {
    return inMemory;
  }

  const signals: WebRTCSignal[] = [];

  // 2. Fallback check for Redis signals (only if in-memory queue was empty)
  const redis = getRedisClient();
  if (redis) {
    try {
      const listKey = `room:${roomId}:signals:${targetAuthor}`;
      const rawList = await redis.lrange<string[]>(listKey, 0, -1);
      if (Array.isArray(rawList) && rawList.length > 0) {
        if (isRedisWritable()) {
          redis.del(listKey).catch(markRedisNonWritable);
        }
        rawList.forEach((raw) => {
          try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const sig = parsed?.signal || parsed;
            if (sig && sig.type) {
              signals.push(sig);
            }
          } catch {
            // ignore
          }
        });
      }
    } catch (err) {
      console.warn('[Redis] popAllSignalsAsync notice:', err);
    }
  }

  // 3. Deduplicate signals in case any signal was present in both in-memory and Redis
  const seenKeys = new Set<string>();
  const uniqueSignals: WebRTCSignal[] = [];
  for (const s of signals) {
    const key = `${s.type}-${s.senderId}-${JSON.stringify(s.data || '')}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueSignals.push(s);
    }
  }

  return uniqueSignals;
}


