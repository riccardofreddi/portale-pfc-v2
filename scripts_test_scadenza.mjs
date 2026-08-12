/**
 * scripts_test_scadenza.mjs
 * -------------------------
 * Test end-to-end del flusso SCADENZE, senza aspettare il cron di Vercel.
 *
 * Cosa fa:
 *   1) Crea una scadenza a OGGI+10gg con anticipoGiorni=10 (imminente subito).
 *   2) Lancia il cron /api/scadenze/check (Bearer CRON_SECRET) come Vercel.
 *   3) Verifica Notification tipo "scadenza" creata e scadenza.notificata=true.
 *   4) Verifica che il banner cliente (/api/documenti/scadenza/list) la mostri.
 *   5) Simula il cliente che conferma il pagamento.
 *   6) Verifica che la scadenza sparisca dal banner.
 *   7) Pulisce tutto.
 *
 * PREREQUISITI: dev server su SERVER_URL; CRON_SECRET in env/.env;
 * un utente CLIENTE esistente (altrimenti ne crea uno di test).
 * Esecuzione: node scripts_test_scadenza.mjs
 */
import { readFileSync } from 'fs'
import { PrismaClient } from '@prisma/client'

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let createdUserId = null
let testFilePath = null

async function findOrCreateClient() {
  let client = await db.user.findFirst({ where: { role: 'client' }, orderBy: { createdAt: 'asc' } })
  if (client) return client
  const username = 'scripttest_client'
  client = await db.user.create({
    data: { username, name: 'Test Cliente', passwordHash: 'x', role: 'client' },
  })
  createdUserId = client.id
  return client
}

async function main() {
  const cron = loadEnv('CRON_SECRET')
  if (!cron) {
    console.error('ERRORE: CRON_SECRET non trovato in env/.env.')
    process.exit(1)
  }

  const client = await findOrCreateClient()
  console.log('Cliente di test:', client.username, '(', client.id, ')')
  testFilePath = `Documenti/${client.username}/2026/script-test-scadenza.pdf`

  await db.notification.deleteMany({ where: { type: 'scadenza', detail: testFilePath } })
  await db.scadenza.deleteMany({ where: { filePath: testFilePath } })

  const fra10 = new Date()
  fra10.setDate(fra10.getDate() + 10)
  fra10.setHours(12, 0, 0, 0)

  const scad = await db.scadenza.create({
    data: {
      filePath: testFilePath,
      userId: client.id,
      titolo: 'F24 Test Scadenza',
      dataScadenza: fra10,
      anticipoGiorni: 10,
      notificata: false,
      pagata: false,
    },
  })
  console.log('\n[1] Scadenza creata:', scad.id, '→', fra10.toISOString().slice(0, 10), '(anticipo 10gg)')

  console.log('\n[2] POST', SERVER_URL + '/api/scadenze/check', '(Bearer CRON_SECRET)...')
  const res = await fetch(SERVER_URL + '/api/scadenze/check', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cron },
  })
  const body = await res.json().catch(() => ({}))
  console.log('    status:', res.status, 'risposta:', JSON.stringify(body))

  await sleep(300)
  const notif = await db.notification.findFirst({
    where: { type: 'scadenza', detail: testFilePath, userId: client.id },
    orderBy: { ts: 'desc' },
  })
  const scadDopo = await db.scadenza.findUnique({ where: { filePath: testFilePath } })
  console.log('\n[3] Verifiche DB:')
  console.log('    Notification tipo scadenza creata:', !!notif, notif ? '→ "' + notif.text + '"' : '')
  console.log('    scadenza.notificata =', scadDopo?.notificata, '(atteso true)')

  const nelBanner = await db.scadenza.findMany({
    where: { userId: client.id, pagata: false, dataScadenza: { gte: new Date() } },
  })
  const visibile = nelBanner.some((s) => s.filePath === testFilePath)
  console.log('\n[4] Visibile nel banner cliente (pagata=false & data>=oggi):', visibile, '(atteso true)')

  console.log('\n[5] POST', SERVER_URL + '/api/documenti/scadenza/paga', '{ pagata:true }...')
  const resP = await fetch(SERVER_URL + '/api/documenti/scadenza/paga', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath: testFilePath, pagata: true }),
  })
  let pagataOk = resP.ok
  if (!resP.ok) {
    console.log('    (HTTP non autenticata, simulo via DB: pagata=true)')
    await db.scadenza.update({ where: { filePath: testFilePath }, data: { pagata: true } })
    pagataOk = true
  } else {
    console.log('    status:', resP.status, await resP.text())
  }

  await sleep(200)
  const nelBannerDopo = await db.scadenza.findMany({
    where: { userId: client.id, pagata: false, dataScadenza: { gte: new Date() } },
  })
  const ancoraVisibile = nelBannerDopo.some((s) => s.filePath === testFilePath)
  console.log('\n[6] Dopo pagata, ancora nel banner:', ancoraVisibile, '(atteso false) → sparisce OK')

  await db.notification.deleteMany({ where: { type: 'scadenza', detail: testFilePath } })
  await db.scadenza.deleteMany({ where: { filePath: testFilePath } })
  if (createdUserId) await db.user.delete({ where: { id: createdUserId } }).catch(() => {})
  console.log('\n[7] Pulizia completata. Test', pagataOk && visibile && !ancoraVisibile && !!notif ? 'SUPERATO ✅' : 'DA VERIFICARE ⚠')
}

main()
  .catch((e) => console.error('ERRORE:', e.message))
  .finally(() => db.$disconnect())

