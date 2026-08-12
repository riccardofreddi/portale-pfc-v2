import { PrismaClient } from '@prisma/client'
const directUrl = (process.env.DATABASE_URL || '').replace(':6543', ':5432')
const db = new PrismaClient({ datasources: { db: { url: directUrl } } })
try {
  const u = await db.user.findUnique({ where: { username: 'freddi' } })
  if (!u) { console.log('freddi NON trovato'); process.exit(1) }
  const scd = await db.scadenza.findMany({ where: { userId: u.id }, select: { filePath: true, titolo: true, dataScadenza: true, pagata: true, notificata: true } })
  console.log('Scadenze freddi:', scd.length)
  scd.forEach((s) => console.log('  -', s.filePath, '|', s.dataScadenza, '| pagata:', s.pagata, '| notificata:', s.notificata))
  const fav = await db.favorite.findMany({ where: { userId: u.id }, select: { filePath: true }, take: 10 })
  console.log('Favorite freddi (file noti):', fav.length)
  fav.forEach((f) => console.log('  - fav:', f.filePath))
} catch (e) { console.error('ERRORE', e.message) } finally { await db.$disconnect() }
