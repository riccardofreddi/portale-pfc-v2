/* eslint-disable no-restricted-globals */
const CACHE_NAME = 'pfc-v2'
const APP_SHELL = ['/', '/icon.png', '/manifest.json']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      ),
    ])
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const action = event.action
  const targetUrl = event.notification.data?.url || '/'
  const notifId = event.notification.data?.notifId

  if (action === 'mark_read' && notifId) {
    fetch('/api/notifiche?action=segna_lette', { method: 'POST' }).catch(() => {})
    return
  }

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of allClients) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) {
            await client.navigate(targetUrl)
          }
          return
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl)
      }
    })()
  )
})

self.addEventListener('push', (event) => {
  let payload = { title: 'Portale PFC', body: '', url: '/', tag: 'pfc-notification' }
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() }
    }
  } catch {
    if (event.data) {
      payload.body = event.data.text()
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/icon.png',
    badge: payload.badge || '/icon.png',
    tag: payload.tag || 'pfc-notification',
    renotify: true,
    data: { url: payload.url || '/', notifId: payload.notifId },
    vibrate: [80, 40, 80],
    requireInteraction: false,
    actions: [
      { action: 'open', title: 'Apri' },
      { action: 'mark_read', title: 'Segna come letto' },
    ],
  }

  event.waitUntil(self.registration.showNotification(payload.title, options))
})

self.addEventListener('sync', (event) => {
  if (event.tag === 'pfc-retry-push') {
    event.waitUntil(console.log('[SW] Background sync trigger'))
  }
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  if (event.data?.type === 'SET_BADGE' && 'setAppBadge' in navigator) {
    navigator.setAppBadge(event.data.count).catch(() => {})
  }
  if (event.data?.type === 'CLEAR_BADGE' && 'clearAppBadge' in navigator) {
    navigator.clearAppBadge().catch(() => {})
  }
})