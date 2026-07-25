import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, logAudit } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  const { username, exempt } = await req.json()
  if (!username) return NextResponse.json({ error: 'Username mancante' }, { status: 400 })

  await db.user.update({
    where: { username },
    data: { exemptMaintenance: Boolean(exempt) },
  })

  await logAudit(session.sub, 'ESENTE_MANUTENZIONE', `${username}: ${exempt ? 'ATTIVATA' : 'DISATTIVATA'}`)
  return NextResponse.json({ ok: true })
}
