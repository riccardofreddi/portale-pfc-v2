import { readFileSync } from 'fs'
import { PrismaClient } from '@prisma/client'

const PROD = 'https://portale-pfc-v2-n27swbfj0-riccardofreddis-projects.vercel.app'
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

  const filePath = `Documenti/${username}/2026/prod-test-scadenza-10gg.pdf`
  // Pulizia eventuale precedente
  await db.notification.deleteMany({ where: { type: 'scadenza', detail: filePath } })
  await db.scadenza.deleteMany({ where: { filePath } })

  const fra10 = new Date(); fra10.setDate(fra10.getDate() + 10); fra10.setHours(12,0,0,0)
  const scad = await db.scadenza.create({
    data: {
      filePath,
      userId: user.id,
      titolo: 'F24 Test Scadenza (-10gg)',
      dataScadenza: fra10,
      anticipoGiorni: 10,
      notificata: false,
      pagata: false,
    },
  })
  console.log('Scadenza creata per freddi:', scad.id, '->', fra10.toISOString().slice(0,10), '(anticipo 10gg)')

  console.log('\nLancio cron su PRODUZIONE:', PROD + '/api/scadenze/check')
  const t0 = Date.now()
  const res = await fetch(PROD + '/api/scadenze/check', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cron },
  })
  const body = await res.json().catch(() => ({}))
  console.log('status:', res.status, 'in', (Date.now()-t0) + 'ms')
  console.log('risposta:', JSON.stringify(body))

  await sleep(500)
  const dopo = await db.scadenza.findUnique({ where: { filePath } })
  const notif = await db.notification.findFirst({
    where: { type: 'scadenza', detail: filePath, userId: user.id },
    orderBy: { ts: 'desc' },
  })
  console.log('\nVerifiche:')
  console.log('  scadenza.notificata =', dopo?.notificata, '(atteso true)')
  console.log('  notifica campanella creata =', !!notif, notif ? '-> "' + notif.text + '"' : '')
  console.log('  push inviata a freddi (subs attive = 1) -> se notificata=true la push e\' stata tentata dal server prod')

  console.log('\nOra guarda il telefono: dovresti ricevere la push "⏰ Scadenza imminente" anche se non sei loggato.')
  console.log('Lascio la scadenza attiva 60s per poterla vedere nel banner dell\'app, poi la pulisco...')
  await sleep(60000)

  await db.notification.deleteMany({ where: { type: 'scadenza', detail: filePath } })
  await db.scadenza.deleteMany({ where: { filePath } })
  console.log('Pulizia completata. Fatto.')
} catch (e) {
  console.error('ERRORE', e.message)
} finally {
  await db.$disconnect()
}
