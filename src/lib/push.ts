/**
 * Portale PFC — Web Push Notifications helper.
 */

import webpush from 'web-push'
import https from 'node:https'
import { webcrypto } from 'crypto'
import { db } from './db'

// Polyfill crypto per Node.js runtime su Vercel (web-push ne ha bisogno)
const globalWithCrypto = globalThis as unknown as { crypto?: Crypto }
if (!globalWithCrypto.crypto) {
  globalWithCrypto.crypto = webcrypto as unknown as Crypto
}

type PushSubscriptionRow = {
  id: string
  userId: string
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

// ---------------------------------------------------------------------------
// Agent HTTPS dedicato SENZA keep-alive.
//
// Senza un agent esplicito, web-push usa https.globalAgent, che da Node >= 19 ha
// keepAlive: true: i socket verso il push service (FCM) restano aperti nel pool.
// Su Vercel (serverless) questi socket vengono chiusi dalla piattaforma quando la
// funzione va in freeze/teardown; al riuso nel warm start successivo la richiesta
// viene scritta su un socket morto e fallisce con ECONNRESET "socket hang up"
// (statusCode undefined) — è per questo che gli invii fallivano TUTTI, anche senza
// timeout. Con keepAlive: false ogni richiesta apre una connessione TLS nuova e la
// chiude appena finita: non esiste alcun socket da riutilizzare, quindi niente
// "socket hang up". Un solo agent per invocazione (maxSockets limita il paralle
// lismo negli invii broadcast).
// ---------------------------------------------------------------------------
const pushAgent = new https.Agent({ keepAlive: false, maxSockets: 20 })

// Errori transitori di rete (nessuna risposta HTTP dal push service): conviene
// ritentare una volta. Gli errori con statusCode (404/410/401/403) sono risposte
// definitive del push service: NON si ritentano, la subscription va ripulita
// (lo fa già il chiamante).
function isTransientNetworkError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const e = err as { statusCode?: unknown; message?: unknown }
  if (e.statusCode !== undefined) return false
  const msg = String(e.message ?? '').toLowerCase()
  return /socket hang up|econnreset|timed out|etimedout|epipe|eai_again|enotfound|network|econnrefused/.test(msg)
}

async function sendPushWithRetry(
  sub: webpush.PushSubscription,
  body: string,
  options: webpush.RequestOptions
): Promise<void> {
  try {
    await webpush.sendNotification(sub, body, { ...options, agent: pushAgent })
  } catch (err) {
    if (isTransientNetworkError(err)) {
      const msg = String((err as Error)?.message ?? err)
      console.log(`[PUSH] Errore transitorio (${msg}), riprovo una volta`)
      // Retry con un agent fresco: assorbe i reset di connessione del cold start.
      await webpush.sendNotification(sub, body, { ...options, agent: new https.Agent({ keepAlive: false }) })
    } else {
      throw err
    }
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

    const startMs = Date.now()

    const user = await db.user.findUnique({
      where: { username },
      select: { id: true },
    })
    if (!user) return 0

    // Query in parallelo (serverless: meno roundtrip, meno latenza): subscription,
    // conteggio non lette e ID ultima notifica per badge e azioni "segna letto".
    const [subs, unreadCount, latestUnread] = await Promise.all([
      db.pushSubscription.findMany({ where: { userId: user.id } }),
      db.notification.count({ where: { userId: user.id, read: false } }),
      db.notification.findFirst({
        where: { userId: user.id, read: false },
        orderBy: { ts: 'desc' },
        select: { id: true },
      }),
    ])
    if (subs.length === 0) return 0

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? '/',
      tag: payload.tag ?? 'pfc-notification',
      icon: payload.icon ?? '/icon.png',
      badge: payload.badge ?? '/icon.png',
      notifId: latestUnread?.id,
      unreadCount,
    })

    console.log('[PUSH] Tentativo di invio a', subs.length, 'subs per', username)

    const results = await Promise.allSettled(
      subs.map((s) =>
        sendPushWithRetry(toSubscription(s), body, {
          TTL: 60 * 60 * 24,
          urgency: 'high',
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
        const err = r.reason as { statusCode?: number; message?: string; body?: unknown; headers?: unknown; code?: string }
        console.error('[PUSH] Invio FALLITO per endpoint', i, '- status:', err?.statusCode, '- code:', err?.code, '- message:', err?.message, '- body:', JSON.stringify(err?.body)?.substring(0, 300), '- headers:', JSON.stringify(err?.headers)?.substring(0, 300))
        // 404/410 = subscription rimossa dal dispositivo; 401/403 = subscription orfana o
        // creata con chiavi VAPID diverse. In ogni caso non è più consegnabile: va ripulita.
        if (
          err?.statusCode === 404 ||
          err?.statusCode === 410 ||
          err?.statusCode === 401 ||
          err?.statusCode === 403
        ) {
          staleEndpoints.push(subs[i].endpoint)
        }
      }
    })

    if (staleEndpoints.length > 0) {
      await db.pushSubscription.deleteMany({
        where: { endpoint: { in: staleEndpoints } },
      }).catch(() => {})
    }

    console.log(
      `[PUSH] sendPushToUser completato: ${success}/${subs.length} successi in ${Date.now() - startMs}ms`
    )
    return success
  } catch (err) {
    console.error('[PUSH] sendPushToUser errore:', err)
    return 0
  }
}

export async function sendPushToAll(payload: PushPayload): Promise<number> {
  try {
    ensureConfigured()

    const startMs = Date.now()

    const subs = await db.pushSubscription.findMany({
      include: { user: { select: { id: true } } },
    })
    if (subs.length === 0) return 0

    // Conta le notifiche non lette per ciascun utente (per il badge)
    const userIds = [...new Set(subs.map((s) => s.userId))]
    const unreadGroups = await db.notification.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, read: false },
      _count: { _all: true },
    })
    const unreadByUser = new Map(unreadGroups.map((g) => [g.userId, g._count._all]))

    const results = await Promise.allSettled(
      subs.map((s) =>
        sendPushWithRetry(
          toSubscription(s),
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            url: payload.url ?? '/',
            tag: payload.tag ?? 'pfc-broadcast',
            icon: payload.icon ?? '/icon.png',
            badge: payload.badge ?? '/icon.png',
            unreadCount: unreadByUser.get(s.userId) ?? 0,
          }),
          {
            TTL: 60 * 60 * 24,
            urgency: 'high',
          }
        )
      )
    )

    let success = 0
    const staleEndpoints: string[] = []

    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        success++
      } else {
        const err = r.reason as { statusCode?: number }
        if (
          err?.statusCode === 404 ||
          err?.statusCode === 410 ||
          err?.statusCode === 401 ||
          err?.statusCode === 403
        ) {
          staleEndpoints.push(subs[i].endpoint)
        }
      }
    })

    if (staleEndpoints.length > 0) {
      await db.pushSubscription.deleteMany({
        where: { endpoint: { in: staleEndpoints } },
      }).catch(() => {})
    }

    console.log(
      `[PUSH] sendPushToAll completato: ${success}/${subs.length} successi in ${Date.now() - startMs}ms`
    )
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
