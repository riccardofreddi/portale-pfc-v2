/* eslint-disable no-restricted-globals */
const CACHE_NAME = 'pfc-v2'
const APP_SHELL = ['/', '/icon.png', '/manifest.json']
const BADGE_KEY = 'pfc-unread-count'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const action = event.action
  const targetUrl = event.notification.data?.url || '/'
  const notifId = event.notification.data?.notifId

  // Azioni: mark_read -> segna tutte le notifiche come lette e azzera badge
  if (action === 'mark_read' && notifId) {
    fetch('/api/notifiche?action=segna_lette', { method: 'POST' })
      .catch(() => {})
      .finally(() => {
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
          for (const client of clients) {
            client.postMessage({ type: 'BADGE_UPDATE' })
          }
        })
      })
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

function setBadgeCount(count) {
  // Badge nativo PWA (Android/Chrome)
  if ('setAppBadge' in self.navigator) {
    if (count > 0) {
      self.navigator.setAppBadge(count).catch(() => {})
    } else {
      self.navigator.clearAppBadge().catch(() => {})
    }
  }
  // Salva il conteggio per ripristino al riavvio della PWA
  caches.open(CACHE_NAME).then((cache) => {
    const res = new Response(String(count), { headers: { 'Content-Type': 'text/plain' } })
    cache.put(BADGE_KEY, res)
  })
}

async function restoreBadge() {
  try {
    const cache = await caches.open(CACHE_NAME)
    const cached = await cache.match(BADGE_KEY)
    if (cached) {
      const text = await cached.text()
      const count = parseInt(text, 10) || 0
      setBadgeCount(count)
    }
  } catch {}
}

// True se almeno una finestra del portale è aperta E visibile
async function hasVisibleClient() {
  try {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clients) {
      // windowClient.visibilityState è supportato in Chrome/Edge/Opera
      if (client.visibilityState === 'visible') return true
    }
  } catch {}
  // Fallback: se non riesco a verificare, mostra la notifica di sistema
  return false
}

self.addEventListener('push', (event) => {
  let payload = { title: 'Portale PFC', body: '', url: '/', tag: 'pfc-notification', unreadCount: 0 }
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() }
    }
  } catch {
    if (event.data) {
      payload.body = event.data.text()
    }
  }

  const unreadCount = typeof payload.unreadCount === 'number' ? payload.unreadCount : 0
  setBadgeCount(unreadCount)

  event.waitUntil(
    (async () => {
      const isVisible = await hasVisibleClient()

      // Comunica alla pagina aperta che è arrivata una push -> aggiornamento immediato badge UI
      // (la pagina farà il SUO suono in-app se è visibile)
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clients) {
        client.postMessage({ type: 'PUSH_RECEIVED', unreadCount })
      }

      // Se il portale è aperto e visibile NON mostriamo la notifica di sistema:
      // il suono in-app + pallino rosso sono l'unico avviso (niente doppio suono).
      if (isVisible) return

      const options = {
        body: payload.body,
        icon: payload.icon || '/icon.png',
        badge: payload.badge || '/icon.png',
        tag: payload.tag || 'pfc-notification',
        renotify: true,
        data: { url: payload.url || '/', notifId: payload.notifId, unreadCount },
        vibrate: [80, 40, 80],
        requireInteraction: false,
        actions: [
          { action: 'open', title: 'Apri' },
          { action: 'mark_read', title: 'Segna come letto' },
        ],
      }

      // Portale chiuso o in background: mostra la notifica di sistema
      await self.registration.showNotification(payload.title, options)
    })()
  )
})

// Ripristina badge all'avvio dell'app
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
  if (event.data?.type === 'SET_BADGE' && 'setAppBadge' in self.navigator) {
    self.navigator.setAppBadge(event.data.count).catch(() => {})
    setBadgeCount(event.data.count)
  }
  if (event.data?.type === 'CLEAR_BADGE' && 'clearAppBadge' in self.navigator) {
    self.navigator.clearAppBadge().catch(() => {})
    setBadgeCount(0)
  }
  if (event.data?.type === 'GET_BADGE') {
    restoreBadge()
  }
})

self.addEventListener('sync', (event) => {
  if (event.tag === 'pfc-retry-push') {
    event.waitUntil(console.log('[SW] Background sync trigger'))
  }
})

// Al riavvio/attivazione ripristina il badge
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      ),
      restoreBadge(),
    ])
  )
})