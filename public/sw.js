// ViTransfer Service Worker for Push Notifications
// This service worker handles incoming push notifications

const CACHE_NAME = 'vitransfer-v1'

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...')
  // Skip waiting to activate immediately
  self.skipWaiting()
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activated')
  event.waitUntil(
    Promise.all([
      // Take control of all clients immediately
      self.clients.claim(),
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      }),
    ])
  )
})

// Push event - display notification
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received')

  if (!event.data) {
    console.log('[SW] Push event has no data')
    return
  }

  let payload
  try {
    payload = event.data.json()
  } catch (e) {
    console.error('[SW] Failed to parse push data:', e)
    payload = {
      title: 'ViTransfer',
      body: event.data.text() || 'You have a new notification',
    }
  }

  const options = {
    body: payload.body || 'You have a new notification',
    icon: payload.icon || '/brand/icon-192.svg',
    badge: payload.badge || '/brand/icon-192.svg',
    tag: payload.tag || 'default',
    data: payload.data || {},
    vibrate: [100, 50, 100],
    requireInteraction: false,
    silent: false,
    renotify: true,
    actions: payload.actions || [],
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'ViTransfer', options)
  )
})

// Notification click event - open the app
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag)

  event.notification.close()

  // Determine URL based on notification data
  const data = event.notification.data || {}
  let url = '/admin'

  if (data.url) {
    // Use the deep link URL if provided (e.g. direct to comment, video, etc.)
    url = data.url
  } else {
    switch (data.type) {
      case 'CLIENT_COMMENT':
      case 'VIDEO_APPROVAL':
      case 'SHARE_ACCESS':
        if (data.projectId) {
          url = `/admin/projects/${data.projectId}`
        }
        break
      case 'ADMIN_ACCESS':
      case 'SECURITY_ALERT':
        url = '/admin/security'
        break
      default:
        url = '/admin'
    }
  }

  // Handle action button clicks
  if (event.action) {
    switch (event.action) {
      case 'view':
        // Default URL handling above
        break
      case 'dismiss':
        return // Just close the notification
      default:
        break
    }
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing window
      for (const client of clientList) {
        if (client.url.includes('/admin') && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      // Open a new window if none exists
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })
  )
})

// Notification close event (optional tracking)
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event.notification.tag)
})

// Message event - handle messages from the main app
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data)

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Fetch event - network-first strategy (minimal caching for admin app)
self.addEventListener('fetch', (event) => {
  // Only handle same-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return
  }

  // Skip caching for API requests
  if (event.request.url.includes('/api/')) {
    return
  }

  // Network-first strategy for everything else
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request)
    })
  )
})
