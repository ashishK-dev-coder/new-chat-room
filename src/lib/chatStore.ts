// In-memory ephemeral store for strictly 2-person real-time chat (no database, no persistence)

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface ClientSubscriber {
  id: string;
  senderId: string;
  send: (data: string) => boolean;
  lastSeen: number;
}

export interface RoomState {
  roomId: string;
  messages: ChatMessage[];
  clients: Map<string, ClientSubscriber>; // connectionId -> subscriber
  activeAuthors: Map<string, number>; // senderId -> lastSeen timestamp
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

const MAX_MESSAGES = 4; // strictly maintain at most 4 messages
const MAX_AUTHORS = 2; // strictly 2-person chat room
const AUTHOR_INACTIVITY_TIMEOUT_MS = 35000; // 35 seconds inactivity timeout

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
      activeAuthors: new Map(),
    };
    rooms.set(roomId, room);
  }
  return room;
}

// Prune inactive authors and dead connections
function pruneStale(room: RoomState): void {
  const now = Date.now();

  // 1. Prune authors with no heartbeat for > 35s
  room.activeAuthors.forEach((lastSeen, authorId) => {
    if (now - lastSeen > AUTHOR_INACTIVITY_TIMEOUT_MS) {
      room.activeAuthors.delete(authorId);
    }
  });

  // 2. Prune dead client connections
  const deadIds: string[] = [];
  room.clients.forEach((sub, id) => {
    if (now - sub.lastSeen > AUTHOR_INACTIVITY_TIMEOUT_MS) {
      deadIds.push(id);
    }
  });
  deadIds.forEach((id) => room.clients.delete(id));
}

// Check if an author is permitted to join / participate in this 2-person room
export function canAuthorParticipate(roomId: string, senderId: string): boolean {
  const room = getOrCreateRoom(roomId);
  pruneStale(room);

  // If already an active author in room, allowed
  if (room.activeAuthors.has(senderId)) {
    return true;
  }

  // If room has less than 2 authors, allowed to take an open slot
  if (room.activeAuthors.size < MAX_AUTHORS) {
    room.activeAuthors.set(senderId, Date.now());
    return true;
  }

  // Room is currently occupied by 2 other active authors
  return false;
}

// Touch author heartbeat
export function touchAuthorPresence(roomId: string, senderId: string): void {
  const room = rooms.get(roomId);
  if (!room || !senderId) return;
  room.activeAuthors.set(senderId, Date.now());
}

// Subscribe client to room SSE events with strict 2-person limit
export function subscribeToRoom(
  roomId: string,
  senderId: string,
  sendFn: (data: string) => boolean
): { unsubscribe: () => void; allowed: boolean } {
  const room = getOrCreateRoom(roomId);
  pruneStale(room);

  // Enforce 2-person room capacity
  if (!room.activeAuthors.has(senderId) && room.activeAuthors.size >= MAX_AUTHORS) {
    return {
      allowed: false,
      unsubscribe: () => {},
    };
  }

  // Mark author as active
  room.activeAuthors.set(senderId, Date.now());

  const connId = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const subscriber: ClientSubscriber = {
    id: connId,
    senderId,
    send: sendFn,
    lastSeen: Date.now(),
  };

  room.clients.set(connId, subscriber);

  // Broadcast presence count strictly clamped to 1 or 2
  broadcastPresence(room);

  return {
    allowed: true,
    unsubscribe: () => {
      room.clients.delete(connId);

      // Check if this author has any remaining active connections
      let hasOtherConnections = false;
      room.clients.forEach((sub) => {
        if (sub.senderId === senderId) {
          hasOtherConnections = true;
        }
      });

      if (!hasOtherConnections) {
        room.activeAuthors.delete(senderId);
      }

      broadcastPresence(room);
    },
  };
}

// Broadcast presence count (strictly capped at 2 for authentic Word co-authoring)
function broadcastPresence(room: RoomState) {
  pruneStale(room);
  const clampedAuthorCount = Math.min(MAX_AUTHORS, Math.max(1, room.activeAuthors.size));

  const payload = JSON.stringify({
    type: 'presence',
    clientCount: clampedAuthorCount,
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

// Add message with strict 4-message ceiling and 2-person room enforcement
export function addMessageToRoom(
  roomId: string,
  message: { senderId: string; senderName: string; text: string }
): { success: boolean; messages: ChatMessage[]; error?: string } {
  const room = getOrCreateRoom(roomId);
  pruneStale(room);

  // Enforce 2-person limit
  if (!canAuthorParticipate(roomId, message.senderId)) {
    return {
      success: false,
      messages: room.messages,
      error: 'Room full: Only 2 persons are permitted in this chat room.',
    };
  }

  room.activeAuthors.set(message.senderId, Date.now());

  const newMsg: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    senderId: message.senderId,
    senderName: message.senderName || 'Anonymous',
    text: message.text,
    timestamp: Date.now(),
  };

  room.messages.push(newMsg);

  // Maintain strictly at most 4 messages (oldest removed)
  if (room.messages.length > MAX_MESSAGES) {
    room.messages = room.messages.slice(-MAX_MESSAGES);
  }

  // Broadcast to all connected clients
  const payload = JSON.stringify({
    type: 'message',
    message: newMsg,
    messages: room.messages,
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

  return { success: true, messages: room.messages };
}

export function clearRoomMessages(roomId: string, senderId?: string): { success: boolean } {
  const room = getOrCreateRoom(roomId);
  room.messages = [];

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

  return { success: true };
}

export function getRoomMessages(roomId: string): ChatMessage[] {
  const room = rooms.get(roomId);
  return room ? room.messages.slice(-MAX_MESSAGES) : [];
}

export function verifyRoomPassword(_roomId: string, passwordAttempt: string): boolean {
  const expectedPassword = getSystemPassword();

  // If no password configured in environment, allow access by default
  if (!expectedPassword) {
    return true;
  }

  return (passwordAttempt || '').trim() === expectedPassword;
}
