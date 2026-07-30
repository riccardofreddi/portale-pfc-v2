/**
 * Portale PFC — Web Push Notifications helper.
 */

import webpush from 'web-push'
import { db } from './db'

// Polyfill crypto per Node.js runtime su Vercel (web-push ne ha bisogno)
try {
  const { webcrypto } = require('crypto')
  if (!(globalThis as any).crypto) {
    (globalThis as any).crypto = webcrypto as any
  }
} catch (e) {
  console.warn('[PUSH] crypto polyfill fallito:', e)
}

type PushSubscriptionRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

let configured = false

function ensureConfigured() {
  if (configured) return
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@portalepfc.it'

  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys non configurate.')
  }

  console.log('[PUSH] Config VAPID - public len:', publicKey.length, '- subject:', subject)
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

function toSubscription(row: PushSubscriptionRow): webpush.PushSubscription {
  return {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
  }
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
  icon?: string
  badge?: string
}

export async function sendPushToUser(
  username: string,
  payload: PushPayload
): Promise<number> {
  try {
    ensureConfigured()

    const user = await db.user.findUnique({
      where: { username },
      select: { id: true },
    })
    if (!user) return 0

    const subs = await db.pushSubscription.findMany({
      where: { userId: user.id },
    })
    if (subs.length === 0) return 0

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? '/',
      tag: payload.tag ?? 'pfc-notification',
      icon: payload.icon ?? '/icon.png',
      badge: payload.badge ?? '/icon.png',
    })

    console.log('[PUSH] Tentativo di invio a', subs.length, 'subs per', username)

    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(toSubscription(s), body, {
          TTL: 60 * 60 * 24,
          urgency: 'normal',
        })
      )
    )

    let success = 0
    const staleEndpoints: string[] = []

    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        success++
        console.log('[PUSH] Invio OK per endpoint', i, '-', subs[i].endpoint.substring(0, 60) + '...')
      } else {
        const err = r.reason as { statusCode?: number; message?: string; body?: unknown; headers?: unknown }
        console.error('[PUSH] Invio FALLITO per endpoint', i, '- status:', err?.statusCode, '- message:', err?.message, '- body:', JSON.stringify(err?.body)?.substring(0, 300), '- headers:', JSON.stringify(err?.headers)?.substring(0, 300))
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          staleEndpoints.push(subs[i].endpoint)
        }
      }
    })

    if (staleEndpoints.length > 0) {
      await db.pushSubscription.deleteMany({
        where: { endpoint: { in: staleEndpoints } },
      }).catch(() => {})
    }

    console.log('[PUSH] Totale successi:', success, '/', subs.length)
    return success
  } catch (err) {
    console.error('[PUSH] sendPushToUser errore:', err)
    return 0
  }
}

export async function sendPushToAll(payload: PushPayload): Promise<number> {
  try {
    ensureConfigured()

    const subs = await db.pushSubscription.findMany()
    if (subs.length === 0) return 0

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? '/',
      tag: payload.tag ?? 'pfc-broadcast',
      icon: payload.icon ?? '/icon.png',
      badge: payload.badge ?? '/icon.png',
    })

    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(toSubscription(s), body, {
          TTL: 60 * 60 * 24,
          urgency: 'normal',
        })
      )
    )

    let success = 0
    const staleEndpoints: string[] = []

    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        success++
      } else {
        const err = r.reason as { statusCode?: number }
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          staleEndpoints.push(subs[i].endpoint)
        }
      }
    })

    if (staleEndpoints.length > 0) {
      await db.pushSubscription.deleteMany({
        where: { endpoint: { in: staleEndpoints } },
      }).catch(() => {})
    }

    return success
  } catch (err) {
    console.error('[PUSH] sendPushToAll errore:', err)
    return 0
  }
}

export async function countPushSubscriptions(username: string): Promise<number> {
  try {
    const user = await db.user.findUnique({
      where: { username },
      select: { id: true },
    })
    if (!user) return 0
    return await db.pushSubscription.count({ where: { userId: user.id } })
  } catch {
    return 0
  }
}
