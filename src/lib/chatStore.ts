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
}

export interface RoomState {
  roomId: string;
  messages: ChatMessage[];
  clients: Map<string, ClientSubscriber>; // connectionId -> subscriber
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
    };
    rooms.set(roomId, room);
  }
  return room;
}

// Get set of unique active author IDs in the room based on currently open SSE connections
export function getActiveAuthorIds(room: RoomState): Set<string> {
  const ids = new Set<string>();
  room.clients.forEach((sub) => {
    if (sub.senderId) {
      ids.add(sub.senderId);
    }
  });
  return ids;
}

// Get active author count (strictly clamped between 1 and 2)
export function getActiveAuthorCount(room: RoomState): number {
  const uniqueAuthors = getActiveAuthorIds(room);
  return Math.min(MAX_AUTHORS, Math.max(1, uniqueAuthors.size));
}

// Check if an author is permitted to join / send messages in this 2-person room
export function canAuthorParticipate(roomId: string, senderId: string): boolean {
  const room = getOrCreateRoom(roomId);
  const activeIds = getActiveAuthorIds(room);

  // If already an active author in room, allowed
  if (activeIds.has(senderId)) {
    return true;
  }

  // If room has less than 2 distinct authors connected, allowed
  if (activeIds.size < MAX_AUTHORS) {
    return true;
  }

  // Room is currently occupied by 2 other active authors
  return false;
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
}

// Subscribe client to room SSE events with strict 2-person limit
export function subscribeToRoom(
  roomId: string,
  senderId: string,
  sendFn: (data: string) => boolean
): { unsubscribe: () => void; allowed: boolean } {
  const room = getOrCreateRoom(roomId);
  const activeIds = getActiveAuthorIds(room);

  // Enforce 2-person room capacity: if 2 distinct authors are already connected and this is a 3rd new author
  if (!activeIds.has(senderId) && activeIds.size >= MAX_AUTHORS) {
    return {
      allowed: false,
      unsubscribe: () => {},
    };
  }

  const connId = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const subscriber: ClientSubscriber = {
    id: connId,
    senderId,
    send: sendFn,
  };

  room.clients.set(connId, subscriber);

  // Broadcast presence count to all connected clients (e.g. updates from 1 Author to 2 Authors)
  broadcastPresence(room);

  return {
    allowed: true,
    unsubscribe: () => {
      room.clients.delete(connId);
      // Immediately notify remaining client of updated count
      broadcastPresence(room);
    },
  };
}

// Add message with strict 4-message ceiling and 2-person room enforcement
export function addMessageToRoom(
  roomId: string,
  message: { senderId: string; senderName: string; text: string }
): { success: boolean; messages: ChatMessage[]; error?: string } {
  const room = getOrCreateRoom(roomId);

  // Enforce 2-person limit
  if (!canAuthorParticipate(roomId, message.senderId)) {
    return {
      success: false,
      messages: room.messages,
      error: 'Room full: Only 2 persons are permitted in this chat room.',
    };
  }

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
