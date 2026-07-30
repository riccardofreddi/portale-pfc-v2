'use client'

/**
 * Hook per iscrizione Web Push Notifications.
 *
 * Logica:
 *  1. Registra il Service Worker (/sw.js)
 *  2. Recupera la VAPID public key dal backend
 *  3. Chiama PushManager.subscribe() con applicationServerKey
 *  4. Invia la subscription al backend (POST /api/push/subscribe)
 *
 * Stato esposto:
 *  - supported: boolean (false se il browser non supporta le push o SW)
 *  - permission: NotificationPermission ('default' | 'granted' | 'denied')
 *  - subscribed: boolean (true se c'è una subscription attiva per QUESTA sessione)
 *  - subscribe(): Promise<void> - avvia il flusso di iscrizione
 *  - unsubscribe(): Promise<void> - rimuove la subscription
 *  - test(): Promise<void> - invia una push di test
 */

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api-client'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = typeof window !== 'undefined' ? window.atob(base64) : ''
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i)
  }
  return output
}

export interface PushState {
  supported: boolean
  permission: NotificationPermission
  subscribed: boolean
  loading: boolean
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
  test: () => Promise<{ ok: boolean; sent?: number; msg?: string }>
}

export function usePushNotifications(enabled: boolean = true): PushState {
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(false)

  // Init: controlla supporto e permission
  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return

    const isSupported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window

    setSupported(isSupported)
    if (isSupported && 'Notification' in window) {
      setPermission(Notification.permission)
    }
  }, [enabled])

  // Verifica se c'è già una subscription attiva
  const checkExistingSubscription = useCallback(async () => {
    if (!supported) return
    try {
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      setSubscribed(!!existing)
    } catch {
      setSubscribed(false)
    }
  }, [supported])

  useEffect(() => {
    if (!enabled || !supported) return
    checkExistingSubscription()
  }, [enabled, supported, checkExistingSubscription])

  const subscribe = useCallback(async () => {
    if (!supported) throw new Error('Push non supportato da questo browser')
    setLoading(true)
    try {
      // 1. Register SW (idempotente)
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready

      // 2. Chiedi permission
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        throw new Error('Permesso notifiche negato')
      }

      // 3. Get VAPID public key
      const { publicKey } = await api.push.vapidKey()
      const applicationServerKey = urlBase64ToUint8Array(publicKey)

      // 4. Subscribe
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      })

      // 5. Send to backend
      const subJson = sub.toJSON()
      await api.push.subscribe({
        endpoint: subJson.endpoint!,
        keys: {
          p256dh: subJson.keys!.p256dh!,
          auth: subJson.keys!.auth!,
        },
      })

      setSubscribed(true)
    } finally {
      setLoading(false)
    }
  }, [supported])

  const unsubscribe = useCallback(async () => {
    setLoading(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (existing) {
        const endpoint = existing.endpoint
        await existing.unsubscribe()
        await api.push.unsubscribe(endpoint).catch(() => {})
      }
      setSubscribed(false)
    } finally {
      setLoading(false)
    }
  }, [])

  const test = useCallback(async () => {
    return await api.push.test()
  }, [])

  return {
    supported,
    permission,
    subscribed,
    loading,
    subscribe,
    unsubscribe,
    test,
  }
}
