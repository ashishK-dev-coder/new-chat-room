# Discreet MS Word Real-Time 2-Person Chat System

A real-time 2-person chat disguised completely as a authentic Microsoft Word 365 / Desktop document editor. Built with **Next.js 16**, **TypeScript**, and **Tailwind CSS**.

---

## 🌟 Key Features

### 1. 100% Microsoft Word Replica UI (Stealth)
- **Title Bar**: Office blue title bar with quick access tools (Save, Undo, Redo), `Document1 - Word` title, search bar, active co-author avatars, and Windows minimize/maximize/close buttons.
- **Ribbon Interface**: Full Office ribbon tabs (*File, Home, Insert, Draw, Design, Layout, References, Review, View, Help*) with real formatting controls for Font (Calibri, Aptos, Arial, size, bold, italic, underline) and Paragraph alignments.
- **Ruler**: Horizontal inch ruler with authentic margin sliders and tick marks.
- **A4 Document Canvas**: High-fidelity A4 white paper page on Word's neutral gray desktop canvas.
- **Status Bar**: Live Word dynamic word count, "Page 1 of 1", proofing checkmark, view toggles, and functional zoom slider.

### 2. Enter-to-Send Inline Typing
- You type directly on the document page just like drafting a regular Word document.
- Pressing **`Enter`** immediately transmits the line to the peer.
- Pressing **`Shift + Enter`** inserts a line break.
- No chat bubbles, no send buttons, no timestamps or chat-like elements.

### 3. Strict 4-Message Rolling Window
- Only the **most recent 4 messages** remain visible in the document.
- When the **5th message** arrives, the oldest (1st) message is automatically discarded from both UI and memory.

### 4. Windows Key Panic Wipe
- Press the **`Windows Key`** (`Meta` / `OS`) or **`Escape`** or **`Ctrl + Alt + C`** at any moment.
- The entire chat is wiped from your screen in **0ms** (instant blank page).
- The background automatically sends a clear signal to the server, clearing the room and wiping the peer's screen simultaneously.

### 5. Access Lock & Environment Variable Password
- When a user opens the document, it loads in authentic **Protected View**.
- Clicking **`[ Enable Editing ]`** or clicking to add a clause prompts for the authoring password.
- **Environment Variable**: The password is read securely from `CHAT_PASSWORD` (or `DOCUMENT_PASSWORD`).
  - **Local Development**: Set in `.env.local` (`CHAT_PASSWORD=your_password`).
  - **Vercel Deployment**: Set in Vercel **Project Settings -> Environment Variables** (`CHAT_PASSWORD`).
  - If no environment variable is set, it allows access by default.

### 6. Zero Database / 100% Ephemeral
- All real-time synchronization runs in-memory via Server-Sent Events (SSE).
- No chat history is saved to any disk, file, or database.

---

## 🚀 How to Run

1. Open a terminal in this directory:
   ```bash
   cd "C:\Users\ashis\Desktop\Self-Knowledge\chat-project"
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open in your browser:
   - **Person 1**: [http://localhost:3000/?room=secret-room](http://localhost:3000/?room=secret-room)
   - **Person 2**: [http://localhost:3000/?room=secret-room](http://localhost:3000/?room=secret-room) (in an incognito window or another browser/device on local network)

---

## ⌨️ Panic Keys & Controls

| Key / Trigger | Action |
| --- | --- |
| **`Ctrl`** | **Panic Wipe + Logout**: Instantly clears all messages, logs out, no popup |
| **`Alt`** | **Panic Wipe + Logout**: Instantly clears all messages, logs out, no popup |
| **`Windows Key`** (`Meta` / `OS`) | **Panic Wipe + Logout**: Instantly clears all messages, logs out, no popup |
| **`Fn`** | **Panic Wipe + Logout**: Instantly clears all messages, logs out, no popup |
| **`Escape`** | **Panic Wipe + Logout**: Instantly clears all messages, logs out, no popup |
| **`Enter`** | Send message to peer |
| **`Shift + Enter`** | Multi-line break |
| **Click `• Click to append...`** | Opens Password Dialog only when explicitly wanting to chat |
