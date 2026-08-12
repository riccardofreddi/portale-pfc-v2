/**
 * /api/documenti/scadenza/paga
 *
 * POST { filePath, pagata } → marca (o annulla) lo stato "pagata" di una scadenza.
 *
 * - Il CLIENTE può marcare solo le proprie scadenze (ricavate dal filePath
 *   Documenti/<username>/...). È il modo in cui il cliente fa sparire la
 *   scadenza dal banner ("ho pagato").
 * - L'ADMIN può marcare qualsiasi scadenza.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, logAudit } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { filePath, pagata } = await req.json().catch(() => ({}))
  if (!filePath || typeof filePath !== 'string') {
    return NextResponse.json({ error: 'filePath mancante' }, { status: 400 })
  }
  const nuovoStato = pagata === false ? false : true

  // Il cliente può toccare solo le proprie scadenze.
  if (session.role === 'client') {
    const parts = filePath.split('/')
    const username = parts[1]
    if (username !== session.sub) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
    }
  }

  const existing = await db.scadenza.findUnique({ where: { filePath } })
  if (!existing) return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })

  const scadenza = await db.scadenza.update({
    where: { filePath },
    data: { pagata: nuovoStato },
  })

  await logAudit(session.sub, nuovoStato ? 'SCADENZA_PAGATA' : 'SCADENZA_PAGATA_RESET', filePath)
  return NextResponse.json({ ok: true, pagata: scadenza.pagata })
}
