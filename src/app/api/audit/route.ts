/**
 * /api/audit
 * GET — admin: lista log audit (solo clienti, non admin)
 *   ?username=... filtra per username
 *   ?action=... filtra per azione
 * DELETE — admin: reset log (tutto o per singolo cliente con ?username=...)
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, logAudit } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Azioni tipiche admin da ESCLUDERE dalla vista attività clienti
const ADMIN_ACTIONS = [
  'CREA_CLIENTE', 'ELIMINA_CLIENTE', 'MODIFICA_CLIENTE', 'PUBBLICA_AVVISO',
  'ELIMINA_AVVISO', 'INVIA_MESSAGGIO', 'ELIMINA_MESSAGGIO', 'DELETE_DOC',
  'RECUPERA_FILE_CESTINO', 'ELIMINA_DEFINITIVO_CESTINO', 'SVUOTA_CESTINO',
  'MANUTENZIONE', 'RESET_AUDIT', 'ADMIN_ZIP', 'BACKUP_COMPLETO',
  'ESENTE_MANUTENZIONE', 'DELETE_BULK',
]

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '500', 10), 1000)
  const usernameFilter = searchParams.get('username')
  const actionFilter = searchParams.get('action')

  const where: { username?: any; action?: any } = {
    username: { not: 'admin' },
    action: { notIn: ADMIN_ACTIONS },
  }
  if (usernameFilter) {
    where.username = usernameFilter === 'admin' ? { not: 'admin' } : usernameFilter
  }
  if (actionFilter) {
    where.action = actionFilter
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

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const usernameFilter = searchParams.get('username')

  if (usernameFilter) {
    // Cancella cronologia di un singolo cliente
    await db.auditLog.deleteMany({ where: { username: usernameFilter } })

    return NextResponse.json({ ok: true, message: `Cronologia di ${usernameFilter} azzerata` })
  }

  // Cancella tutto
  await db.auditLog.deleteMany({})

  return NextResponse.json({ ok: true })
}
