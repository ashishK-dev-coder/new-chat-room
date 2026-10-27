// Ephemeral Document Collaboration Service Worker
// Enables native mobile system notifications, lockscreen wake-up, and phone chime alerts

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

let lastActiveReportTime = 0;
let isClientActivelyFocused = false;

// Real-time heartbeat from document tab
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLIENT_STATE') {
    isClientActivelyFocused = Boolean(event.data.isActivelyFocused);
    lastActiveReportTime = event.data.timestamp || Date.now();
  }
});

// High-Urgency Web Push Handler: Wakes up phone from lock screen & Doze mode
self.addEventListener('push', (event) => {
  let payload = {
    title: 'Document Notice',
    body: 'New clause updated in document framework.',
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed) {
        payload = parsed;
      }
    }
  } catch {
    // fallback
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const now = Date.now();
      // Actively focused ONLY if client sent an active heartbeat within 3.5s AND has a focused window
      const hasRecentHeartbeat = (now - lastActiveReportTime) < 3500;
      const hasFocusedClient = clientList.some(
        (client) => client.visibilityState === 'visible' && client.focused
      );

      const isUserActivelyLookingAtChat = isClientActivelyFocused && hasRecentHeartbeat && hasFocusedClient;

      // Only suppress push if the user is actively holding phone/laptop, unlocked, and looking at the document
      if (isUserActivelyLookingAtChat) {
        return;
      }

      // Screen is OFF, phone is locked, tab is hidden, or document is locked in Protected View:
      // Show system notification on lock screen, play default phone sound, and vibrate!
      return self.registration.showNotification(payload.title || 'Document Notice', {
        body: payload.body || 'New clause updated in document framework.',
        icon: '/file.svg',
        badge: '/file.svg',
        tag: 'doc-notice-' + Date.now(), // Unique tag ensures every new message triggers sound & vibration
        renotify: true,
        silent: false, // Ensures default phone notification chime/ringtone plays
        vibrate: [350, 150, 350],
        data: {
          url: '/',
        },
      });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus open Word window if available
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ('focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open the document window
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
