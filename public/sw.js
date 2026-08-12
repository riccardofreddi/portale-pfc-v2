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
      // Parametri da applicare all'apertura: tab (es. ?tab=messaggi), e per i
      // documenti anche anno e cartella (?tab=archivio&anno=...&cartella=...)
      let tab = null
      let anno = null
      let cartella = null
      try {
        const params = new URL(targetUrl, self.location.origin).searchParams
        tab = params.get('tab')
        anno = params.get('anno')
        cartella = params.get('cartella')
      } catch {}

      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })

      // 1) Avvisa subito le finestre aperte: la tab viene attivata anche se la
      //    navigazione qui sotto fallisce (es. client già sulla stessa URL).
      if (tab || anno || cartella) {
        for (const client of allClients) {
          try {
            client.postMessage({ type: 'OPEN_TAB', tab, anno, cartella })
          } catch {}
        }
      }

      // 2) Focus sulla prima finestra e navigazione alla URL del payload
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) {
            try {
              await client.navigate(targetUrl)
            } catch {
              // La pagina ha già ricevuto OPEN_TAB: applica comunque la tab
            }
          }
          return
        }
      }

      // 3) Nessuna finestra aperta: apri la PWA alla URL target
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

// Chiede alle finestre APERTE se una di esse (visibile e loggata) gestirà la
// notifica in-app (suono + toast). Se riceve PUSH_ACK con visible=true entro il
// timeout, NON mostra la notifica di sistema (niente doppio suono).
// In tutti gli altri casi — app chiusa, in background, pagina di login visibile
// (cliente disconnesso) — mostra la notifica di sistema con suono.
//
// NOTA: source.visibilityState NON è affidabile nei messaggi SW in tutti i browser.
// Quindi è il CLIENT a dichiarare la propria visibilità nel PUSH_ACK ({ visible: true }).
const PUSH_ACK_TIMEOUT_MS = 600

function askVisibleClients(clients, unreadCount, data) {
  return new Promise((resolve) => {
    let settled = false
    let onMessage = () => {}
    const finish = (handled) => {
      if (settled) return
      settled = true
      self.removeEventListener('message', onMessage)
      resolve(handled)
    }
    onMessage = (event) => {
      // Il client dichiara esplicitamente se è visibile E loggato (visible: true)
      if (event.data?.type === 'PUSH_ACK' && event.data?.visible === true) finish(true)
    }
    self.addEventListener('message', onMessage)
    setTimeout(() => finish(false), PUSH_ACK_TIMEOUT_MS)

    // Invia PUSH_RECEIVED a tutte le finestre aperte (anche login page, anche background)
    // Il client risponderà PUSH_ACK solo se è visibile E l'utente è loggato
    for (const client of clients) {
      const isVisible = client.visibilityState === 'visible'
      try {
        client.postMessage({ type: 'PUSH_RECEIVED', unreadCount, ack: isVisible, data })
      } catch {}
    }

    // Nessuna finestra aperta: mostra subito la notifica di sistema
    if (clients.length === 0) finish(false)
  })
}

self.addEventListener('push', (event) => {
  let payload = { title: 'Portale PFC', body: '', url: '/', tag: 'pfc-notification', unreadCount: 0, data: {} }
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
      // Aggiornamento immediato badge UI sulle pagine aperte + conferma (PUSH_ACK)
      // da parte di una finestra visibile che gestirà la notifica in-app.
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const handledByPage = await askVisibleClients(clients, unreadCount, payload.data)

      if (handledByPage) return

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

      // Portale chiuso, in background, o pagina di login visibile senza conferma:
      // mostra la notifica di sistema
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