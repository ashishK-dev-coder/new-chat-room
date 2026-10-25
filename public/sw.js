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
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Only suppress if the user is actively viewing an open visible tab with screen on
      const isActivelyFocused = clientList.some((c) => c.visibilityState === 'visible' && c.focused);
      if (isActivelyFocused) {
        return;
      }

      const options = {
        body: payload.body || 'New clause updated in document framework.',
        icon: '/file.svg',
        badge: '/file.svg',
        tag: 'doc-notice',
        renotify: false,
        silent: false, // Ensures default phone notification chime/ringtone plays!
        vibrate: [200, 100, 200],
        data: {
          url: '/',
        },
      };

      return self.registration.showNotification(payload.title || 'Document Notice', options);
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
