const { PrismaClient } = require('@prisma/client')
let url = process.env.PDB
  .replace(/:[0-9]+\//, ':5432/')
  .replace(/[?&]pgbouncer=true/, '')
  .replace(/[?&]prepared_statements=false/, '')
  .replace(/\?$/, '')
const p = new PrismaClient({ datasources: { db: { url } } })
p.$queryRawUnsafe(
  "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='fcm_tokens' ORDER BY ordinal_position"
)
  .then((r) => {
    console.log('COLONNE:', JSON.stringify(r))
    return p.$disconnect()
  })
  .catch((e) => {
    console.error('ERR', e.message)
    process.exit(1)
  })
