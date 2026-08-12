import { readFileSync } from 'fs'
import { PrismaClient } from '@prisma/client'

// Usa connessione DIRETTA (porta 5432) per evitare l'errore "prepared statement
// already exists" del pgbouncer (porta 6543) con $executeRawUnsafe.
const directUrl = (process.env.DATABASE_URL || '').replace(':6543', ':5432')
const db = new PrismaClient({ datasources: { db: { url: directUrl } } })

const sql = readFileSync('prisma/migrations/scadenze_pagata.sql', 'utf8')
const cleaned = sql
  .split('\n')
  .map((l) => l.replace(/--.*$/, ''))
  .join('\n')
const statements = cleaned.split(';').map((s) => s.trim()).filter((s) => s.length > 0)

try {
  for (const st of statements) {
    try {
      await db.$executeRawUnsafe(st)
      console.log('OK:', st.slice(0, 70).replace(/\n/g, ' '))
    } catch (e) {
      console.error('FAIL:', st.slice(0, 70).replace(/\n/g, ' '), '->', e.message)
    }
  }
  console.log('MIGRATION DONE')
} catch (e) {
  console.error('ERR:', e.message)
} finally {
  await db.$disconnect()
}
