const { PrismaClient } = require('@prisma/client')
const fs = require('fs')

let url = process.env.PDB
  .replace(/:[0-9]+\//, ':5432/')
  .replace(/[?&]pgbouncer=true/, '')
  .replace(/[?&]prepared_statements=false/, '')
  .replace(/\?$/, '')

const p = new PrismaClient({ datasources: { db: { url } } })

async function run(label, sql) {
  try {
    const r = await p.$executeRawUnsafe(sql)
    console.log(label, '-> OK', JSON.stringify(r))
  } catch (e) {
    console.log(label, '-> ERR', e.message)
  }
}

async function main() {
  // Indice aggiuntivo (statement singolo, sicuro)
  await run('INDEX user_id', 'CREATE INDEX IF NOT EXISTS "fcm_tokens_user_id_idx" ON "fcm_tokens"("user_id")')

  // Verifica vincoli
  const cons = await p.$queryRawUnsafe(
    "SELECT constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_schema='public' AND table_name='fcm_tokens'"
  )
  console.log('VINCOLI:', JSON.stringify(cons, null, 2))
  const cols = await p.$queryRawUnsafe(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='fcm_tokens' ORDER BY ordinal_position"
  )
  console.log('COLONNE:', JSON.stringify(cols, null, 2))
  await p.$disconnect()
}
main()
