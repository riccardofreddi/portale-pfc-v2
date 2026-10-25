/**
 * Portale PFC — FCM (Firebase Cloud Messaging) helper per l'app nativa v3.
 *
 * MODULO ADDITIVO: non altera in alcun modo la Web Push esistente.
 * Se le variabili d'ambiente FIREBASE_* non sono configurate, tutto il modulo
 * resta "disabilitato" e le funzioni ritornano 0/[] silenziosamente, così il
 * backend v2 continua a comportarsi esattamente come prima.
 */

import { db } from './db'

// ---------------------------------------------------------------------------
// Inizializzazione lazy di firebase-admin. Avviene solo al primo uso e solo se
// sono presenti projectId + le credenziali del service account (FCM). In caso
// contrario `adminApp` resta null e il modulo è disabilitato.
// ---------------------------------------------------------------------------
type FcmModule = {
  enabled: boolean
  messaging: () => Promise<import('firebase-admin/messaging').Messaging | null>
}

let cached: FcmModule | null = null

function loadFcm(): FcmModule {
  if (cached) return cached

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) {
    console.log('[FCM] Non configurato (mancano FIREBASE_*): push nativa disabilitata.')
    cached = { enabled: false, messaging: async () => null }
    return cached
  }

  // Import dinamico: firebase-admin non viene mai caricato se non serve.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const admin = require('firebase-admin')
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    })
  }
  const app = admin
  console.log('[FCM] Inizializzato per il progetto', projectId)
  cached = {
    enabled: true,
    messaging: async () => app.messaging(),
  }
  return cached
}

export interface FcmPayload {
  title: string
  body: string
  url?: string
  data?: Record<string, unknown>
  tag?: string
}

/** Ritorna true se il modulo FCM è configurato lato server (env FIREBASE_* presenti). */
export function isFcmEnabled(): boolean {
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
  return Boolean(projectId && clientEmail && privateKey)
}

/** Ritorna i token FCM ancora validi per un utente (tabella fcm_tokens). */
export async function getUserFcmTokens(userId: string): Promise<string[]> {
  const rows = await db.fcmToken.findMany({
    where: { userId },
    select: { token: true },
  })
  return rows.map((r) => r.token)
}

/** Invia un messaggio FCM a tutti i device di un utente. Ritorna n. successi. */
export async function sendFcmToUser(
  userId: string,
  payload: FcmPayload
): Promise<number> {
  const mod = loadFcm()
  if (!mod.enabled) return 0

  const tokens = await getUserFcmTokens(userId)
  if (tokens.length === 0) return 0

  const messaging = await mod.messaging()
  if (!messaging) return 0

  try {
    const results = await Promise.allSettled(
      tokens.map((token) =>
        messaging.send({
          token,
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: {
            url: payload.url ?? '/',
            // Duplichiamo title/body nel data payload: quando l'app è in
            // foreground il plugin Capacitor consegna spesso solo il `data` a
            // pushNotificationReceived.
            title: payload.title,
            body: payload.body,
            ...Object.fromEntries(
              Object.entries(payload.data ?? {}).map(([k, v]) => [k, String(v)])
            ),
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'pfc-alerts-v2',
              defaultSound: true,
              defaultVibrateTimings: true,
              visibility: 'public',
              priority: 'max',
              clickAction: 'FCM_PLUGIN_ACTIVITY',
              // v4.63 - tag Android: due push con lo stesso tag si
              // sostituiscono nella barra di stato invece di accumularsi.
              // Le scadenze viaggiano con tag "pfc-scadenza-<id>": l'avviso
              // di anticipo e il ritento del giorno dopo non fanno due
              // righe per lo stesso documento. Chi non passa tag non ha
              // nessun cambio di comportamento.
              ...(payload.tag ? { tag: payload.tag } : {}),
            },
          },
          apns: {
            payload: {
              aps: {
                alert: { title: payload.title, body: payload.body },
                sound: 'default',
                badge: 1,
              },
            },
          },
        })
      )
    )

    let success = 0
    const stale: string[] = []
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        success++
      } else {
        const code = (r.reason as { code?: string })?.code
        // messaging/registration-token-not-registered => device disinstallato/revocato
        if (code === 'messaging/registration-token-not-registered') {
          stale.push(tokens[i])
        } else {
          console.error('[FCM] Invio fallito per token', i, '-', code)
        }
      }
    })

    if (stale.length > 0) {
      await db.fcmToken
        .deleteMany({ where: { token: { in: stale } } })
        .catch(() => {})
    }

    console.log(`[FCM] inviati ${success}/${tokens.length} a userId ${userId}`)
    return success
  } catch (err) {
    console.error('[FCM] errore invio:', err)
    return 0
  }
}

/**
 * v4.59 — Controllo di vitalita' di un token FCM, SENZA inviare nulla.
 *
 * Usa la "dry run" di FCM: il messaggio viene validato da Google ma NON
 * consegnato al telefono (il cliente non vede nessuna notifica). Se Google
 * risponde che il token non e' piu' registrato (app disinstallata, token
 * revocato), ritorniamo false: il token e' morto e puo' essere rimosso.
 *
 * Prudenza: qualsiasi altro errore (rete, quota, credenziali) ritorna TRUE
 * cosi' un momento di problemi non puo' mai cancellare token buoni.
 */
export async function validaTokenFcm(token: string): Promise<boolean> {
  const mod = loadFcm()
  if (!mod.enabled) return true
  const messaging = await mod.messaging()
  if (!messaging) return true

  try {
    await messaging.send(
      {
        token,
        data: { controllo: 'pulizia-notturna' },
        android: { priority: 'normal' },
        apns: { payload: { aps: { contentAvailable: true } } },
      },
      true // dryRun: valida ma non consegna nulla
    )
    return true
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    ) {
      return false
    }
    console.error('[FCM] controllo token: errore temporaneo, token lasciato:', code)
    return true
  }
}
