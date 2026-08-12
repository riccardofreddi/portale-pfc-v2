/**
 * Verifica end-to-end reale del flusso SCADENZA -> PUSH per l'utente "freddi".
 * 1) Crea una scadenza "domani" sul DB (anticipo 10gg => imminente subito).
 * 2) Lancia il VERO /api/scadenze/check con Bearer CRON_SECRET (come il cron Vercel).
 * 3) Verifica: notifica campanella creata + scadenza.notificata=true.
 * 4) Verifica meccanica: invio push diretto via web-push a FCM (status 201 = consegnata).
 * 5) Pulisce la scadenza di test.
 */
import { readFileSync } from 'fs'
import { PrismaClient } from '@prisma/client'
import webpush from 'web-push'

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000'
const directUrl = (process.env.DATABASE_URL || '').replace(':6543', ':5432')
const db = new PrismaClient({ datasources: { db: { url: directUrl } } })

function loadEnv(key) {
  if (process.env[key]) return process.env[key]
  try {
    const txt = readFileSync('.env', 'utf8')
    const m = txt.split('\n').find((l) => l.startsWith(key + '='))
    return m ? m.substring(key.length + 1).trim().replace(/^["']|["']$/g, '') : undefined
  } catch { return undefined }
}

const username = 'freddi'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  const cron = loadEnv('CRON_SECRET')
  if (!cron) { console.error('CRON_SECRET mancante'); process.exit(1) }

  const user = await db.user.findUnique({ where: { username } })
  if (!user) { console.error('freddi non trovato'); process.exit(1) }

  const subs = await db.pushSubscription.findMany({ where: { userId: user.id } })
  console.log('Subscription push attive per freddi:', subs.length)
  if (subs.length === 0) { console.error('Nessuna subscription: impossibile verificare la push'); process.exit(1) }

  const filePath = `Documenti/${username}/2026/verify-push-test.pdf`
  await db.notification.deleteMany({ where: { type: 'scadenza', detail: filePath } })
  await db.scadenza.deleteMany({ where: { filePath } })

  const domani = new Date(); domani.setDate(domani.getDate() + 1); domani.setHours(12, 0, 0, 0)
  const scad = await db.scadenza.create({
    data: {
      filePath,
      userId: user.id,
      titolo: 'Verifica push scadenza',
      dataScadenza: domani,
      anticipoGiorni: 10,
      notificata: false,
      pagata: false,
    },
  })
  console.log('Scadenza di verifica creata per freddi (scadenza domani):', scad.id)

  // --- 2) Flusso reale: /api/scadenze/check con CRON_SECRET ---
  console.log('\n[CHECK] POST', SERVER_URL + '/api/scadenze/check', '(Bearer CRON_SECRET)...')
  const t0 = Date.now()
  const res = await fetch(SERVER_URL + '/api/scadenze/check', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cron },
  })
  const body = await res.json().catch(() => ({}))
  console.log('  status:', res.status, 'in', (Date.now() - t0) + 'ms')
  console.log('  risposta:', JSON.stringify(body))

  await sleep(500)
  const dopo = await db.scadenza.findUnique({ where: { filePath } })
  const notif = await db.notification.findFirst({
    where: { type: 'scadenza', detail: filePath, userId: user.id },
    orderBy: { ts: 'desc' },
  })
  console.log('\n[DB] Verifiche:')
  console.log('  scadenza.notificata =', dopo?.notificata, '(atteso true)')
  console.log('  notifica campanella creata =', !!notif, notif ? '-> "' + notif.text + '"' : '')

  // --- 4) Prova meccanica di consegna a FCM (status 201 = push accettata dal push service) ---
  const pub = loadEnv('VAPID_PUBLIC_KEY')
  const priv = loadEnv('VAPID_PRIVATE_KEY')
  const subj = loadEnv('VAPID_SUBJECT') || 'mailto:admin@portalepfc.it'
  if (pub && priv) {
    webpush.setVapidDetails(subj, pub, priv)
    const sub = subs[0]
    try {
      const r = await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: 'Prova consegna FCM', body: 'Verifica meccanica invio push', url: '/', tag: 'pfc-verify' }),
        { TTL: 60, urgency: 'high' },
      )
      console.log('\n[FCM] Invio diretto -> status', r.statusCode, r.statusCode === 201 ? '(CONSEGNATA al push service ✅)' : '(DA VERIFICARE ⚠)')
    } catch (e) {
      console.log('\n[FCM] Invio diretto FALLITO ->', e.statusCode || e.message)
    }
  } else {
    console.log('\n[FCM] VAPID keys non trovate: skip prova diretta.')
  }

  console.log('\n>>> Telefono di freddi: dovresti vedere "⏰ Scadenza imminente" (dal CHECK) e "Prova consegna FCM" (prova diretta), anche se non sei loggato.')

  await db.notification.deleteMany({ where: { type: 'scadenza', detail: filePath } })
  await db.scadenza.deleteMany({ where: { filePath } })
  console.log('Pulizia scadenza di test completata.')
} catch (e) {
  console.error('ERRORE', e.message)
} finally {
  await db.$disconnect()
}
