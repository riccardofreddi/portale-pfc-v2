/**
 * Verifica E2E reale del fix "promemoria 100% automatico":
 *  1) Crea due scadenze di TEST per l'utente "freddi" (che ha subscription push):
 *     - una con data SCADENZA = OGGI (00:00)  -> prima veniva SKIPPATA per sempre
 *     - una con data SCADENZA = DOMANI        -> controllo
 *  2) Lancia il VERO /api/scadenze/check di PRODUZIONE con Bearer CRON_SECRET.
 *  3) Verifica che ENTRAMBE ottengano notificata=true (campanella) e, se la push
 *     viene consegnata, pushInviata=true (prova che il promemoria arriva davvero).
 *  4) Pulisce le righe di test.
 *
 * NB: usa $queryRawUnsafe per evitare il conflitto "prepared statement already
 * exists" del transaction pooler Supabase (porta 6543) con Prisma.
 */
import { readFileSync } from 'fs'
import { PrismaClient } from '@prisma/client'

const SERVER_URL = process.env.SERVER_URL || 'https://portale-pfc-v2.vercel.app'

// Il transaction pooler di Supabase (porta 6543) riusa i backend ed e in conflitto
// con i prepared statement di Prisma (errore 42P05). Con pgbouncer=true Prisma
// non usa prepared statement -> niente conflitto per questo script locale.
let dbUrl = process.env.DATABASE_URL
if (dbUrl && !/pgbouncer=/i.test(dbUrl)) {
  dbUrl += (dbUrl.includes('?') ? '&' : '?') + 'pgbouncer=true&connection_limit=1'
}
const db = new PrismaClient(dbUrl ? { datasources: { db: { url: dbUrl } } } : {})

function loadEnv(key) {
  if (process.env[key]) return process.env[key]
  try {
    const txt = readFileSync('.env', 'utf8')
    const m = txt.split('\n').find((l) => l.startsWith(key + '='))
    return m ? m.substring(key.length + 1).trim().replace(/^["']|["']$/g, '') : undefined
  } catch { return undefined }
}

const username = 'freddi'
const cron = loadEnv('CRON_SECRET')
if (!cron) { console.error('CRON_SECRET mancante'); process.exit(1) }

// Il server Vercel gira in UTC: costruiamo le date in UTC esplicito cosi
// cadono sul giorno giusto lato server (il vecchio bug saltava proprio le
// scadenze a mezzanotte-per-UTC, escluse dal filtro ">= now").
const now = new Date()
const oggiUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
const domaniUtc = new Date(oggiUtc); domaniUtc.setUTCDate(domaniUtc.getUTCDate() + 1)

const fpOggi = `Documenti/${username}/2026/verify-oggi.pdf`
const fpDomani = `Documenti/${username}/2026/verify-futuro.pdf`
const isoOggi = oggiUtc.toISOString()
const isoDomani = domaniUtc.toISOString()

try {
  const user = await db.$queryRawUnsafe(
    `SELECT id FROM users WHERE username = $1`, username
  )
  if (!user || user.length === 0) { console.error('utente freddi non trovato'); process.exit(1) }
  const userId = user[0].id
  const subs = await db.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = $1`, userId
  )
  const nSubs = subs[0]?.n ?? 0
  console.log('Subscription push attive per', username + ':', nSubs)

  await db.$queryRawUnsafe(`DELETE FROM notifications WHERE type='scadenza' AND detail = ANY($1)`, [fpOggi, fpDomani])
  await db.$queryRawUnsafe(`DELETE FROM scadenze WHERE file_path = ANY($1)`, [fpOggi, fpDomani]);

  await db.$queryRawUnsafe(
    `INSERT INTO scadenze (id, file_path, user_id, titolo, data_scadenza, anticipo_giorni, notificata, push_inviata, pagata, created_at)
     VALUES (gen_random_uuid(), $1, $2, 'VERIFICA_PROMEMORIA_OGGI', $3::timestamp, 10, false, false, false, now())`,
    fpOggi, userId, isoOggi
  )
  await db.$queryRawUnsafe(
    `INSERT INTO scadenze (id, file_path, user_id, titolo, data_scadenza, anticipo_giorni, notificata, push_inviata, pagata, created_at)
     VALUES (gen_random_uuid(), $1, $2, 'VERIFICA_PROMEMORIA_DOMANI', $3::timestamp, 10, false, false, false, now())`,
    fpDomani, userId, isoDomani
  )
  console.log('\nScadenze di test create (OGGI + DOMANI).')

  console.log('\n[CHECK] POST', SERVER_URL + '/api/scadenze/check', '(Bearer CRON_SECRET)...')
  const res = await fetch(SERVER_URL + '/api/scadenze/check', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cron },
  })
  const body = await res.json().catch(() => ({}))
  console.log('  status:', res.status)
  console.log('  risposta:', JSON.stringify(body))

  const o = await db.$queryRawUnsafe(`SELECT notificata, push_inviata FROM scadenze WHERE file_path = $1`, fpOggi)
  const d = await db.$queryRawUnsafe(`SELECT notificata, push_inviata FROM scadenze WHERE file_path = $1`, fpDomani)
  const nOggi = await db.$queryRawUnsafe(`SELECT text FROM notifications WHERE type='scadenza' AND detail=$1 ORDER BY ts DESC LIMIT 1`, fpOggi)
  const nDomani = await db.$queryRawUnsafe(`SELECT text FROM notifications WHERE type='scadenza' AND detail=$1 ORDER BY ts DESC LIMIT 1`, fpDomani)

  console.log('\n[RISULTATI]')
  console.log('  OGGI  -> notificata=' + o[0]?.notificata + ' pushInviata=' + o[0]?.push_inviata + ' campanella=' + (nOggi.length > 0))
  console.log('  OGGI  -> ' + (nOggi[0] ? '"' + nOggi[0].text + '"' : '(nessuna)'))
  console.log('  DOMANI-> notificata=' + d[0]?.notificata + ' pushInviata=' + d[0]?.push_inviata + ' campanella=' + (nDomani.length > 0))
  console.log('  DOMANI-> ' + (nDomani[0] ? '"' + nDomani[0].text + '"' : '(nessuna)'))

  const okOggi = o[0]?.notificata === true
  const okDomani = d[0]?.notificata === true
  const okPush = nSubs > 0 ? (o[0]?.push_inviata === true && d[0]?.push_inviata === true) : true
  console.log('\n>>> OGGI processata (bug fix):', okOggi ? 'OK ✅' : 'FALLITA ❌')
  console.log('>>> DOMANI processata:', okDomani ? 'OK ✅' : 'FALLITA ❌')
  console.log('>>> Push consegnata:', okPush ? 'OK ✅' : 'NON consegnata ⚠ (verra ritentata dal cron)')
  console.log(okOggi && okDomani ? '\nRISULTATO: promemoria automatico FUNZIONANTE ✅' : '\nRISULTATO: PROBLEMI ❌')
} catch (e) {
  console.error('ERRORE', e)
} finally {
  await db.$queryRawUnsafe(`DELETE FROM notifications WHERE type='scadenza' AND detail = ANY($1)`, [fpOggi, fpDomani]).catch(() => {})
  await db.$queryRawUnsafe(`DELETE FROM scadenze WHERE file_path = ANY($1)`, [fpOggi, fpDomani]).catch(() => {})
  console.log('\nPulizia scadenze di test completata.')
  await db.$disconnect()
}
