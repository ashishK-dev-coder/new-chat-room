// Ephemeral Document Collaboration Service Worker
// Enables native mobile system notifications, lockscreen wake-up, and phone chime alerts

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
    self.registration.showNotification(payload.title || 'Document Notice', {
      body: payload.body || 'New clause updated in document framework.',
      icon: '/file.svg',
      badge: '/file.svg',
      tag: 'doc-notice',
      renotify: true, // Always re-trigger sound & vibration on mobile for new messages
      silent: false, // Ensures default phone notification chime/ringtone plays
      vibrate: [300, 150, 300],
      data: {
        url: '/',
      },
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
