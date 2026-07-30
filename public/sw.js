// Service Worker per Web Push Notifications
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: 'Portale Documenti', body: event.data ? event.data.text() : 'Nuova notifica' }
  }

  const options = {
    body: data.body || 'Hai una nuova notifica',
    icon: '/icon.png',
    badge: '/icon.png',
    data: data.url || '/',
    vibrate: [200, 100, 200],
    tag: data.tag || 'portale-pfc',
    renotify: true,
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Portale Documenti', options)
  )
})

// Click sulla notifica -> apre l'app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})
