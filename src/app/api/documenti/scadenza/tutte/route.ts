/**
 * /api/documenti/scadenza/tutte
 *
 * GET ?username=... → TUTTE le scadenze di un cliente (anche passate e
 * pagate), SOLO per l'admin. Endpoint leggero: una sola query sul database,
 * niente R2. Serve alla console "Gestione Clienti" per l'aggiornamento
 * automatico (poll ~30 secondi) senza ricaricare l'archivio completo:
 * se il cliente preme "Pagato" nel suo archivio, le targhette dell'admin
 * si aggiornano da sole e la finestra "Promemoria scadenza" risulta
 * compilata in automatico (pagata + chi + quando).
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const username = searchParams.get('username') ?? ''
  if (!username) return NextResponse.json({ error: 'Username mancante' }, { status: 400 })

  const user = await db.user.findUnique({ where: { username }, select: { id: true } })
  if (!user) return NextResponse.json({ scadenze: [] })

  const scadenze = await db.scadenza.findMany({
    where: { userId: user.id },
    orderBy: { dataScadenza: 'asc' },
    select: {
      id: true,
      filePath: true,
      titolo: true,
      dataScadenza: true,
      anticipoGiorni: true,
      pagata: true,
      pagataDa: true,
      pagataIl: true,
    },
  })

  return NextResponse.json({ scadenze })
}
