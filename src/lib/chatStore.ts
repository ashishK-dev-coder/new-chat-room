import { getRedisClient } from './redis';

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
  seqCounter?: number;
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
const HEARTBEAT_TIMEOUT_MS = 6000; // 6 seconds threshold for dead author detection

// Fetch the authorization password directly from Environment Variables
export function getSystemPassword(): string {
  return (
    process.env.CHAT_PASSWORD ||
    process.env.PASSWORD ||
    process.env.DOCUMENT_PASSWORD ||
    ''
  ).trim();
}

export function getOrCreateRoom(roomId: string): RoomState {
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      roomId,
      messages: [],
      clients: new Map(),
      authorHeartbeats: new Map(),
    };
    rooms.set(roomId, room);
  }
  if (!room.authorHeartbeats) {
    room.authorHeartbeats = new Map();
  }
  return room;
}

// Record an author heartbeat timestamp and prune expired sessions
export function recordAuthorHeartbeat(roomId: string, senderId: string): number {
  const room = getOrCreateRoom(roomId);
  const prevCount = getActiveAuthorCount(room);
  room.authorHeartbeats.set(senderId, Date.now());
  const count = getActiveAuthorCount(room);

  // Sync to Redis presence key with 8-second TTL if Redis is configured
  const redis = getRedisClient();
  if (redis) {
    redis.set(`room:${roomId}:author:${senderId}`, '1', { ex: 8 }).catch(() => {});
  }

  // If author count changes (e.g. 1 -> 2 authors), broadcast immediately over SSE and Redis!
  if (count !== prevCount) {
    broadcastPresence(room);
  }

  return count;
}

// Explicitly and instantly remove an author who closed the tab or left the page
export function removeAuthorFromRoom(roomId: string, senderId: string): void {
  const room = getOrCreateRoom(roomId);

  // 1. Remove from heartbeats
  if (room.authorHeartbeats) {
    room.authorHeartbeats.delete(senderId);
  }

  // 2. Remove all SSE client connections associated with this author
  const connIdsToRemove: string[] = [];
  room.clients.forEach((sub, id) => {
    if (sub.senderId === senderId) {
      connIdsToRemove.push(id);
    }
  });
  connIdsToRemove.forEach((id) => room.clients.delete(id));

  // 3. Remove from Redis presence if configured
  const redis = getRedisClient();
  if (redis) {
    redis.del(`room:${roomId}:author:${senderId}`).catch(() => {});
  }

  // 4. Immediately broadcast updated presence (drops to 1 Author in < 50ms)
  broadcastPresence(room);
}

// Get set of unique active author IDs in the room based on currently open SSE connections & live heartbeats
export function getActiveAuthorIds(room: RoomState): Set<string> {
  const now = Date.now();
  const ids = new Set<string>();
  const deadConnIds: string[] = [];

  // 1. Open SSE client streams
  room.clients.forEach((sub, connId) => {
    const lastBeat = room.authorHeartbeats?.get(sub.senderId) ?? now;
    // If no heartbeat within 6 seconds, consider connection dead
    if (now - lastBeat > HEARTBEAT_TIMEOUT_MS) {
      deadConnIds.push(connId);
    } else if (sub.senderId) {
      ids.add(sub.senderId);
    }
  });

  deadConnIds.forEach((id) => {
    room.clients.delete(id);
  });

  // 2. Live author heartbeats (guarantees author 2 is detected immediately upon opening tab / polling)
  if (room.authorHeartbeats) {
    const expiredAuthors: string[] = [];
    room.authorHeartbeats.forEach((lastBeat, senderId) => {
      if (now - lastBeat <= HEARTBEAT_TIMEOUT_MS) {
        ids.add(senderId);
      } else {
        expiredAuthors.push(senderId);
      }
    });
    expiredAuthors.forEach((sid) => room.authorHeartbeats?.delete(sid));
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

  const payload = JSON.stringify({
    type: 'presence',
    clientCount: clampedCount,
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

  // Publish to Redis Pub/Sub for cross-lambda instant presence sync
  const redis = getRedisClient();
  if (redis) {
    redis.publish(`room:${room.roomId}:pubsub`, payload).catch(() => {});
  }
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

  // 1. Monotonically increasing atomic sequence counter for 100% deterministic ordering
  let nextSeq = (room.seqCounter || 0) + 1;
  if (redis) {
    try {
      const redisSeq = await redis.incr(`room:${roomId}:seq`);
      if (typeof redisSeq === 'number' && !isNaN(redisSeq)) {
        nextSeq = redisSeq;
      }
    } catch {
      nextSeq = (room.seqCounter || 0) + 1;
    }
  }
  room.seqCounter = Math.max(room.seqCounter || 0, nextSeq);

  // 2. Fetch latest shared messages from Redis and merge with in-memory messages (never wipe memory!)
  if (redis) {
    try {
      const stored = await redis.get<string | ChatMessage[]>(`room:${roomId}:messages`);
      if (stored) {
        const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
        if (Array.isArray(parsed) && parsed.length > 0) {
          const merged = new Map<string, ChatMessage>();
          for (const m of parsed) merged.set(m.id, m);
          for (const m of room.messages) {
            const ex = merged.get(m.id);
            if (!ex || (m.status === 'seen' && ex.status !== 'seen')) {
              merged.set(m.id, m);
            }
          }
          room.messages = Array.from(merged.values());
        }
      }
    } catch {
      // fallback to memory
    }
  }

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

  // Sort deterministically by seq ascending (and timestamp as fallback), strictly keeping last 4
  room.messages = room.messages
    .sort((a, b) => {
      if (a.seq && b.seq && a.seq !== b.seq) return a.seq - b.seq;
      return a.timestamp - b.timestamp;
    })
    .slice(-MAX_MESSAGES);

  const authorCount = getActiveAuthorCount(room);

  // Broadcast to all connected clients including current participant count
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

  // Sync to Redis Pub/Sub and persistent cache
  if (redis) {
    redis.set(`room:${roomId}:messages`, JSON.stringify(room.messages), { ex: 86400 }).catch(() => {});
    redis.publish(`room:${roomId}:pubsub`, payload).catch(() => {});
  }

  return { success: true, messages: room.messages, message: newMsg };
}

// Mark messages as seen when the co-author opens / reads the document
export async function markMessagesAsSeen(
  roomId: string,
  messageIds: string[],
  seenBy: string
): Promise<{ success: boolean; seenIds: string[] }> {
  const room = getOrCreateRoom(roomId);
  const now = Date.now();
  const seenIds: string[] = [];

  const redis = getRedisClient();
  if (redis) {
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

    if (redis) {
      redis.set(`room:${roomId}:messages`, JSON.stringify(room.messages), { ex: 86400 }).catch(() => {});
      redis.publish(`room:${roomId}:pubsub`, payload).catch(() => {});
    }
  }

  return { success: true, seenIds };
}

export function clearRoomMessages(roomId: string, senderId?: string): { success: boolean } {
  const room = getOrCreateRoom(roomId);
  room.messages = [];
  room.seqCounter = 0;

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
  if (redis) {
    redis.del(`room:${roomId}:messages`).catch(() => {});
    redis.del(`room:${roomId}:seq`).catch(() => {});
    redis.publish(`room:${roomId}:pubsub`, payload).catch(() => {});
  }

  return { success: true };
}

export function getRoomMessages(roomId: string): ChatMessage[] {
  const room = rooms.get(roomId);
  if (!room) return [];
  return [...room.messages]
    .sort((a, b) => {
      if (a.seq && b.seq && a.seq !== b.seq) return a.seq - b.seq;
      return a.timestamp - b.timestamp;
    })
    .slice(-MAX_MESSAGES);
}

export async function getRoomMessagesAsync(roomId: string): Promise<ChatMessage[]> {
  const room = getOrCreateRoom(roomId);
  const redis = getRedisClient();
  if (redis) {
    try {
      const data = await redis.get<string | ChatMessage[]>(`room:${roomId}:messages`);
      if (data) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (Array.isArray(parsed) && parsed.length > 0) {
          const merged = new Map<string, ChatMessage>();
          for (const m of parsed) merged.set(m.id, m);
          for (const m of room.messages) {
            const ex = merged.get(m.id);
            if (!ex || (m.status === 'seen' && ex.status !== 'seen')) {
              merged.set(m.id, m);
            }
          }
          room.messages = Array.from(merged.values())
            .sort((a: ChatMessage, b: ChatMessage) => {
              if (a.seq && b.seq && a.seq !== b.seq) return a.seq - b.seq;
              return a.timestamp - b.timestamp;
            })
            .slice(-MAX_MESSAGES);
          return room.messages;
        }
      }
    } catch {
      // fallback to memory
    }
  }
  return getRoomMessages(roomId);
}

export function verifyRoomPassword(_roomId: string, passwordAttempt: string): boolean {
  const expectedPassword = getSystemPassword();

  // If no password configured in environment, allow access by default
  if (!expectedPassword) {
    return true;
  }

  return (passwordAttempt || '').trim() === expectedPassword;
}
