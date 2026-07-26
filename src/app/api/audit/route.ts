/**
 * /api/audit
 * GET — admin: lista log audit (solo clienti, non admin)
 * DELETE — admin: reset log
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, logAudit } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Azioni tipiche admin da ESCLUDERE dalla vista attività clienti
const ADMIN_ACTIONS = [
  'CREA_CLIENTE',
  'ELIMINA_CLIENTE',
  'MODIFICA_CLIENTE',
  'PUBBLICA_AVVISO',
  'ELIMINA_AVVISO',
  'INVIA_MESSAGGIO',
  'ELIMINA_MESSAGGIO',
  'DELETE_DOC',
  'RECUPERA_FILE_CESTINO',
  'ELIMINA_DEFINITIVO_CESTINO',
  'SVUOTA_CESTINO',
  'MANUTENZIONE',
  'RESET_AUDIT',
  'ADMIN_ZIP',
  'BACKUP_COMPLETO',
  'ESENTE_MANUTENZIONE',
]

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '500', 10), 1000)
  const usernameFilter = searchParams.get('username')

  // Escludi admin user + escludi azioni tipiche admin
  const where: { username?: { not: string }; action?: { notIn: string[] } } = {
    username: { not: 'admin' },
    action: { notIn: ADMIN_ACTIONS },
  }
  if (usernameFilter) {
    delete where.username
    where.username = usernameFilter === 'admin' ? { not: 'admin' } : usernameFilter as any
  }

  const logs = await db.auditLog.findMany({
    where,
    orderBy: { ts: 'desc' },
    take: limit,
  })

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      ts: l.ts,
      username: l.username,
      action: l.action,
      detail: l.detail,
    })),
  })
}

export async function DELETE() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }
  await db.auditLog.deleteMany({})
  await logAudit(session.sub, 'RESET_AUDIT', 'Log azzerato')
  return NextResponse.json({ ok: true })
}
