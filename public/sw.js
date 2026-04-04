const CACHE_NAME = 'vitransfer-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
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

self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
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

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data = event.notification.data || {}
  let url = '/admin'

  if (data.url) {
    url = data.url
  } else {
    switch (data.type) {
      case 'CLIENT_COMMENT':
      case 'VIDEO_APPROVAL':
      case 'CLIENT_UPLOAD':
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

  if (event.action === 'dismiss') return

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/admin') && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url)
      }
    })
  )
})

self.addEventListener('notificationclose', () => {})

self.addEventListener('message', (event) => {
  if (event.origin && event.origin !== self.location.origin) return
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith(self.location.origin)) return
  if (event.request.url.includes('/api/')) return

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  )
})
