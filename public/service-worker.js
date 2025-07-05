// Service Worker for Web Push Notifications
const CACHE_NAME = 'projectflow-v1';

// Install event - cache assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received:', event);

  if (!event.data) {
    console.log('[Service Worker] No data in push event');
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    console.error('[Service Worker] Error parsing push data:', e);
    return;
  }

  const { title, message, icon, badge, tag, data: notificationData } = data;

  const options = {
    body: message,
    icon: icon || '/icon-192x192.png',
    badge: badge || '/icon-72x72.png',
    tag: tag || 'default',
    data: notificationData || {},
    vibrate: [200, 100, 200],
    requireInteraction: data.priority === 'critical' || data.priority === 'high',
    actions: [
      {
        action: 'view',
        title: 'View',
        icon: '/icons/check.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/icons/x.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event - handle notification interactions
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked:', event);
  
  event.notification.close();

  const { action } = event;
  const { entity_type, entity_id, url } = event.notification.data;

  if (action === 'dismiss') {
    return;
  }

  // Determine URL to open
  let targetUrl = '/protected/notifications';
  
  if (url) {
    targetUrl = url;
  } else if (entity_type && entity_id) {
    // Build URL based on entity type
    switch (entity_type) {
      case 'task':
        targetUrl = `/protected/tasks/${entity_id}`;
        break;
      case 'project':
        targetUrl = `/protected/projects/${entity_id}`;
        break;
      case 'organization':
        targetUrl = `/protected/organizations/${entity_id}`;
        break;
      case 'approval':
        targetUrl = `/protected/approvals/${entity_id}`;
        break;
      default:
        targetUrl = '/protected/notifications';
    }
  }

  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Background sync for offline notifications
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-notifications') {
    event.waitUntil(syncNotifications());
  }
});

async function syncNotifications() {
  try {
    const response = await fetch('/api/notifications/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error('Sync failed');
    }
    
    const data = await response.json();
    console.log('[Service Worker] Notifications synced:', data);
  } catch (error) {
    console.error('[Service Worker] Sync error:', error);
  }
}

// Message event - handle messages from the app
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'NOTIFICATION_READ') {
    // Clear notification if it's still showing
    self.registration.getNotifications({ tag: event.data.tag }).then((notifications) => {
      notifications.forEach((notification) => notification.close());
    });
  }
});