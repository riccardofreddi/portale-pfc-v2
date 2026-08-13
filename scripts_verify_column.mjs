import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
try {
  const rows = await db.$queryRawUnsafe(
    `SELECT column_name, column_default
     FROM information_schema.columns
     WHERE table_name = 'scadenze'
       AND column_name IN ('notificata','push_inviata','pagata')
     ORDER BY ordinal_position`
  )
  console.log('Colonne scadenze:', JSON.stringify(rows))
  const hasPush = rows.some((r) => r.column_name === 'push_inviata')
  console.log('push_inviata presente:', hasPush)
  process.exit(hasPush ? 0 : 2)
} catch (e) {
  console.error('ERRORE', e)
  process.exit(1)
} finally {
  await db.$disconnect()
}
