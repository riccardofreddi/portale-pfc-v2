import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, logAudit } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { username, exemptMaintenance } = body as { username: string; exemptMaintenance: boolean }

  if (!username) return NextResponse.json({ error: 'Username mancante' }, { status: 400 })

  const nuovoValore = Boolean(exemptMaintenance)
  await db.user.update({
    where: { username },
    data: { exemptMaintenance: nuovoValore },
  })

  await 
  return NextResponse.json({ ok: true, exemptMaintenance: nuovoValore })
}
