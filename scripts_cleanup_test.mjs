import { PrismaClient } from '@prisma/client'

const directUrl = (process.env.DATABASE_URL || '').replace(':6543', ':5432')
const db = new PrismaClient({ datasources: { db: { url: directUrl } } })

try {
  const u = await db.user.findUnique({ where: { username: 'freddi' } })
  if (!u) { console.log('freddi non trovato'); process.exit(0) }
  const s = await db.scadenza.findMany({ where: { userId: u.id } })
  const test = s.filter((x) => /test/i.test(x.filePath))
  if (test.length) {
    await db.scadenza.deleteMany({ where: { filePath: { in: test.map((x) => x.filePath) } } })
    await db.notification.deleteMany({ where: { type: 'scadenza', detail: { in: test.map((x) => x.filePath) } } })
  }
  console.log('Scadenze residue freddi:', s.length, '| di test eliminate:', test.length)
} catch (e) {
  console.error('ERRORE', e.message)
} finally {
  await db.$disconnect()
}
