const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient({ datasources: { db: { url: process.env.PDB } } })
p.$queryRawUnsafe(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='fcm_tokens'"
)
  .then((r) => {
    console.log('RISULTATO:', JSON.stringify(r))
    return p.$disconnect()
  })
  .catch((e) => {
    console.error('ERR:', e.message)
    process.exit(1)
  })
