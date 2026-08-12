import { PrismaClient } from '@prisma/client'

const directUrl = process.env.DATABASE_URL.replace(':6543', ':5432')
const db = new PrismaClient({ datasources: { db: { url: directUrl } } })

const r = await db.notification.deleteMany({ where: { type: 'scadenza' } })
console.log('notifiche scadenza rimosse:', r.count)
await db.$disconnect()
