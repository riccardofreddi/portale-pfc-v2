/**
 * /api/audit/csv
 * GET - admin: export log audit in CSV
 *   ?username=...  filtra per username
 *   ?action=...    filtra per azione
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function csvEscape(value: string): string {
  if (value == null) return ''
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const usernameFilter = searchParams.get('username')
  const actionFilter = searchParams.get('action')

  const where: { username?: string; action?: string } = {}
  if (usernameFilter) where.username = usernameFilter
  if (actionFilter) where.action = actionFilter

  const logs = await db.auditLog.findMany({
    where,
    orderBy: { ts: 'desc' },
    take: 5000,
  })

  // Header CSV con BOM per Excel
  const header = ['Data', 'Utente', 'Azione', 'Dettaglio']
  const rows = logs.map((l) => [
    csvEscape(l.ts.toISOString()),
    csvEscape(l.username),
    csvEscape(l.action),
    csvEscape(l.detail),
  ])

  const csv = [header, ...rows].map((r) => r.join(',')).join('\r\n')
  const csvWithBom = '\uFEFF' + csv // BOM per Excel

  const finalName = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csvWithBom, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(finalName)}`,
      'Cache-Control': 'private, no-cache',
    },
  })
}
