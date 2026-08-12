/**
 * /api/documenti/scadenza/list
 * GET - restituisce le scadenze del cliente loggato (solo quelle non ancora
 * passate). Usato dal banner "Scadenze imminenti" nell'area cliente.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await db.user.findUnique({ where: { username: session.sub }, select: { id: true } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const scadenze = await db.scadenza.findMany({
    where: {
      userId: user.id,
      dataScadenza: { gte: new Date() },
    },
    orderBy: { dataScadenza: 'asc' },
  })

  return NextResponse.json({
    scadenze: scadenze.map((s) => ({
      id: s.id,
      titolo: s.titolo,
      filePath: s.filePath,
      dataScadenza: s.dataScadenza,
      anticipoGiorni: s.anticipoGiorni,
    })),
  })
}
