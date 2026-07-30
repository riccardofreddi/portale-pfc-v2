/* eslint-disable no-restricted-globals */
/**
 * Portale PFC — Service Worker per Web Push Notifications.
 *
 * Responsabilità:
 *  - Riceve push events dal server (VAPID) e mostra Notification nativa.
 *  - Gestisce click sulla notifica -> apre/focus l'app sull'URL del payload.
 *  - Skip waiting su message 'SKIP_WAITING' (per future versioni del SW).
 */

const CACHE_NAME = 'pfc-v1'
const APP_SHELL = ['/', '/icon.png']

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
      // Pulisci vecchie cache
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      ),
    ])
  )
})

// Chiudi la notifica e apri l'URL quando l'utente ci clicca
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      // Se l'app è già aperta, focus e naviga
      for (const client of allClients) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) {
            await client.navigate(targetUrl)
          }
          return
        }
      }

      // Altrimenti apri nuova finestra
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl)
      }
    })()
  )
})

// Ricezione push
self.addEventListener('push', (event) => {
  let payload = { title: 'Portale PFC', body: '', url: '/', tag: 'pfc-notification' }

  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() }
    }
  } catch {
    // payload non JSON, usa testo raw come body
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
    data: { url: payload.url || '/' },
    vibrate: [80, 40, 80],
    requireInteraction: false,
  }

  event.waitUntil(self.registration.showNotification(payload.title, options))
})

// Aggiornamenti controllati dal client
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
