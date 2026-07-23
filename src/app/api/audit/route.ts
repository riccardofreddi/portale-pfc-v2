import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, logAudit } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '500', 10), 1000)
  const usernameFilter = searchParams.get('username')

  const where = usernameFilter ? { username: usernameFilter } : {}
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
