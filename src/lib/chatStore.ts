// In-memory ephemeral store for 2-person real-time chat (no database, no persistence)

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

export interface RoomState {
  roomId: string;
  messages: ChatMessage[];
  clients: Set<(data: string) => void>;
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
      clients: new Set(),
    };
    rooms.set(roomId, room);
  }
  return room;
}

export function subscribeToRoom(roomId: string, sendFn: (data: string) => void): () => void {
  const room = getOrCreateRoom(roomId);
  room.clients.add(sendFn);

  // Broadcast presence count
  broadcastPresence(room);

  return () => {
    room.clients.delete(sendFn);
    broadcastPresence(room);
  };
}

function broadcastPresence(room: RoomState) {
  const payload = JSON.stringify({
    type: 'presence',
    clientCount: room.clients.size,
    timestamp: Date.now(),
  });
  room.clients.forEach((client) => {
    try {
      client(`data: ${payload}\n\n`);
    } catch {
      // ignore closed stream
    }
  });
}

export function addMessageToRoom(
  roomId: string,
  message: { senderId: string; senderName: string; text: string }
): { success: boolean; messages: ChatMessage[] } {
  const room = getOrCreateRoom(roomId);

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

  room.clients.forEach((client) => {
    try {
      client(`data: ${payload}\n\n`);
    } catch {
      // handle dead connection
    }
  });

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

  room.clients.forEach((client) => {
    try {
      client(`data: ${payload}\n\n`);
    } catch {
      // ignore
    }
  });

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
