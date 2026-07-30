/**
 * Portale PFC — Web Push Notifications helper.
 *
 * Usa web-push (VAPID). Le sottoscrizioni sono salvate nella tabella
 * `push_subscriptions`. Helper pubblici: sendPushToUser / sendPushToAll.
 */

import webpush from 'web-push'
import { db } from './db'

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
    throw new Error('VAPID keys non configurate. Aggiungi VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY su Vercel.')
  }

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

/**
 * Invia una notifica push a tutte le sottoscrizioni di un utente.
 * Ritorna il numero di invii riusciti.
 */
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

    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(toSubscription(s), body, {
          TTL: 60 * 60 * 24, // 24 ore
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
        // 404 = sottoscrizione non più valida, 410 = gone
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          staleEndpoints.push(subs[i].endpoint)
        }
      }
    })

    // Pulisci endpoint morti
    if (staleEndpoints.length > 0) {
      await db.pushSubscription.deleteMany({
        where: { endpoint: { in: staleEndpoints } },
      }).catch(() => {})
    }

    return success
  } catch (err) {
    console.error('[PUSH] sendPushToUser errore:', err)
    return 0
  }
}

/**
 * Invia una notifica push a TUTTI gli utenti (broadcast).
 * Utile per avvisi globali. Ritorna il numero di invii riusciti.
 */
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

/**
 * Conta quante sottoscrizioni push ha un utente.
 */
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
