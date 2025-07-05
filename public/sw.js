// Service Worker for Push Notifications
// This service worker handles push notifications, notification clicks, and background sync

const CACHE_NAME = 'conpanion-notifications-v1';
const NOTIFICATION_CLICK_URL = '/protected/notifications';

// Install event
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Cache opened');
      // Cache essential notification assets
      return cache.addAll([
        '/icons/notification-default.png',
        '/icons/badge.png',
        '/icons/notification-system.png',
        '/icons/notification-approval.png',
        '/icons/notification-task.png',
        '/icons/notification-org.png',
        '/icons/notification-project.png',
        '/icons/notification-form.png',
        '/icons/notification-diary.png',
        '/icons/notification-mention.png',
        '/icons/notification-reminder.png',
        '/icons/notification-update.png',
      ]).catch((error) => {
        console.log('Service Worker: Cache add failed (some icons may not exist yet):', error);
      });
    })
  );
  
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  // Take control of all pages
  return self.clients.claim();
});

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push event received');
  
  let notificationData = {
    title: 'New Notification',
    body: 'You have a new notification',
    icon: '/icons/notification-default.png',
    badge: '/icons/badge.png',
    data: {},
  };
  
  // Parse the push data
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        ...notificationData,
        ...data,
      };
    } catch (e) {
      console.error('Service Worker: Failed to parse push data:', e);
      notificationData.body = event.data.text() || notificationData.body;
    }
  }
  
  // Show the notification
  const notificationPromise = self.registration.showNotification(
    notificationData.title,
    {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      image: notificationData.image,
      data: notificationData.data,
      actions: notificationData.actions,
      silent: notificationData.silent,
      requireInteraction: notificationData.requireInteraction,
      tag: notificationData.tag,
      timestamp: notificationData.timestamp || Date.now(),
      vibrate: [200, 100, 200], // Vibration pattern for mobile
    }
  );
  
  event.waitUntil(notificationPromise);
  
  // Send message to client about the push notification
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'PUSH_RECEIVED',
          data: notificationData,
        });
      });
    })
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification click received');
  
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};
  
  // Close the notification
  notification.close();
  
  // Handle different actions
  let targetUrl = NOTIFICATION_CLICK_URL;
  
  if (action) {
    // Handle action buttons
    switch (action) {
      case 'view':
        targetUrl = data.actionUrl || NOTIFICATION_CLICK_URL;
        break;
      case 'approve':
        targetUrl = data.actionUrl || NOTIFICATION_CLICK_URL;
        break;
      case 'accept':
        targetUrl = data.actionUrl || NOTIFICATION_CLICK_URL;
        break;
      case 'reply':
        targetUrl = data.actionUrl || NOTIFICATION_CLICK_URL;
        break;
      case 'complete':
        targetUrl = data.actionUrl || NOTIFICATION_CLICK_URL;
        break;
      default:
        targetUrl = data.actionUrl || NOTIFICATION_CLICK_URL;
    }
  } else {
    // Handle main notification click
    targetUrl = data.actionUrl || NOTIFICATION_CLICK_URL;
  }
  
  // Open the target URL
  const urlToOpen = new URL(targetUrl, self.location.origin).href;
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Check if there's already a window open with the target URL
      for (const client of clients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      
      // If no window is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
  
  // Send message to client about the notification click
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'NOTIFICATION_CLICK',
          data: {
            notificationId: data.notificationId,
            actionUrl: targetUrl,
            action: action,
            type: data.type,
          },
        });
      });
    })
  );
});

// Notification close event
self.addEventListener('notificationclose', (event) => {
  console.log('Service Worker: Notification closed');
  
  const notification = event.notification;
  const data = notification.data || {};
  
  // Send message to client about the notification close
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'NOTIFICATION_CLOSE',
          data: {
            notificationId: data.notificationId,
            type: data.type,
          },
        });
      });
    })
  );
});

// Background sync event (for future use)
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync:', event.tag);
  
  if (event.tag === 'notification-sync') {
    event.waitUntil(
      // Sync notifications when back online
      syncNotifications()
    );
  }
});

// Message event - handle messages from the client
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received:', event.data);
  
  const { type, data } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    case 'CLAIM_CLIENTS':
      self.clients.claim();
      break;
    case 'CACHE_NOTIFICATION_ASSETS':
      cacheNotificationAssets(data);
      break;
    default:
      console.log('Service Worker: Unknown message type:', type);
  }
});

// Helper function to sync notifications
async function syncNotifications() {
  try {
    console.log('Service Worker: Syncing notifications...');
    
    // Get all clients
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    
    // Send sync message to clients
    clients.forEach((client) => {
      client.postMessage({
        type: 'SYNC_NOTIFICATIONS',
        data: { timestamp: Date.now() },
      });
    });
    
    console.log('Service Worker: Notification sync completed');
  } catch (error) {
    console.error('Service Worker: Notification sync failed:', error);
  }
}

// Helper function to cache notification assets
async function cacheNotificationAssets(assets) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(assets);
    console.log('Service Worker: Notification assets cached');
  } catch (error) {
    console.error('Service Worker: Failed to cache notification assets:', error);
  }
}

// Error handling
self.addEventListener('error', (event) => {
  console.error('Service Worker: Error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('Service Worker: Unhandled promise rejection:', event.reason);
});

// Periodic background sync (for future use)
self.addEventListener('periodicsync', (event) => {
  console.log('Service Worker: Periodic sync:', event.tag);
  
  if (event.tag === 'notification-cleanup') {
    event.waitUntil(
      // Clean up old notifications
      cleanupOldNotifications()
    );
  }
});

// Helper function to clean up old notifications
async function cleanupOldNotifications() {
  try {
    const notifications = await self.registration.getNotifications();
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    notifications.forEach((notification) => {
      const timestamp = notification.timestamp || 0;
      if (now - timestamp > maxAge) {
        notification.close();
      }
    });
    
    console.log('Service Worker: Old notifications cleaned up');
  } catch (error) {
    console.error('Service Worker: Failed to clean up old notifications:', error);
  }
}

console.log('Service Worker: Script loaded');