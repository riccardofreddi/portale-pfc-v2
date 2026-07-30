import webpush from 'web-push'
import { db } from './db'

// Configura web-push con le chiavi VAPID
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:studio@portale-pfc.vercel.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

/**
 * Invia una notifica push a un utente specifico
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.warn('[push] VAPID keys non configurate, skip push')
    return
  }

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId },
  })

  if (subscriptions.length === 0) {
    console.log(`[push] Nessuna iscrizione per userId=${userId}, skip`)
    return
  }

  const pushPayload = JSON.stringify(payload)

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dhKey,
            auth: sub.authKey,
          },
        },
        pushPayload
      )
      console.log(`[push] Notifica inviata a ${sub.endpoint.slice(-20)}`)
    } catch (err: any) {
      console.error(`[push] Errore invio a ${sub.endpoint.slice(-20)}:`, err.statusCode || err.message)
      // Se 410 Gone o 404, l'iscrizione non è più valida -> elimina
      if (err.statusCode === 410 || err.statusCode === 404) {
        await db.pushSubscription.delete({ where: { id: sub.id } })
        console.log(`[push] Iscrizione scaduta eliminata: ${sub.id}`)
      }
    }
  }
}

/**
 * Invia una notifica push a tutti gli utenti (per avvisi globali)
 */
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  const subscriptions = await db.pushSubscription.findMany()
  
  if (subscriptions.length === 0) {
    console.log('[push] Nessuna iscrizione, skip')
    return
  }

  // Raggruppa per userId per evitare duplicati
  const byUser = new Map<string, typeof subscriptions>()
  for (const sub of subscriptions) {
    if (!byUser.has(sub.userId)) byUser.set(sub.userId, [])
    byUser.get(sub.userId)!.push(sub)
  }

  for (const [userId, userSubs] of byUser) {
    for (const sub of userSubs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dhKey, auth: sub.authKey },
          },
          JSON.stringify(payload)
        )
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.pushSubscription.delete({ where: { id: sub.id } })
        }
      }
    }
  }
}
