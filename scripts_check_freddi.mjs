import { readFileSync } from 'fs'
import { PrismaClient } from '@prisma/client'

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
const out = {}

try {
  const user = await db.user.findUnique({ where: { username } })
  if (!user) { console.log('UTENTE freddi NON trovato'); process.exit(1) }
  out.userId = user.id

  const subs = await db.pushSubscription.findMany({ where: { userId: user.id } })
  out.pushSubs = subs.length
  out.endpoints = subs.map((s) => s.endpoint.slice(0, 50) + '...')

  const scad = await db.scadenza.findMany({
    where: { userId: user.id, pagata: false },
    orderBy: { dataScadenza: 'asc' },
  })
  const fra10 = new Date(); fra10.setDate(fra10.getDate() + 10); fra10.setHours(12,0,0,0)
  const oggi = new Date()
  const imminenti = scad.filter((s) => {
    const d = Math.floor(new Date(s.dataScadenza).getTime()/86400000)
    const o = Math.floor(oggi.getTime()/86400000)
    return (d-o) <= s.anticipoGiorni && (d-o) >= 0
  })
  out.totScadenzeNonPagate = scad.length
  out.imminenti = imminenti.map((s) => ({ titolo: s.titolo, data: s.dataScadenza, anticipo: s.anticipoGiorni, notificata: s.notificata, pagata: s.pagata }))
  out.prossimaScadenza = scad[0] ? { titolo: scad[0].titolo, data: scad[0].dataScadenza } : null

  console.log(JSON.stringify(out, null, 2))
} catch (e) {
  console.error('ERRORE', e.message)
} finally {
  await db.$disconnect()
}
