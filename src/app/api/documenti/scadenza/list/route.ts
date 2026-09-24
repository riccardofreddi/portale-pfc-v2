/**
 * /api/documenti/scadenza/list
 * GET - restituisce le scadenze del cliente loggato (solo quelle non ancora
 * passate). Usato dal banner "Scadenze imminenti" nell'area cliente.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { giorniMancanti } from '@/lib/scadenza-notify'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await db.user.findUnique({ where: { username: session.sub }, select: { id: true } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const oggi = new Date()
  // v4.76 - Inizio della giornata (00:00 del fuso del server, come fa il cron
  // in check/route.ts). Prima qui si usava l'istante pieno (new Date()): le
  // scadenze sono salvate a mezzanotte UTC, quindi la scadenza USCIVA dalla
  // lista alle 02:00 italiane del GIORNO STESSO: il banner "scade OGGI"
  // spariva proprio il giorno della scadenza, la sync dell'app tra le 02:00
  // e le 08:30 cancellava la sveglia delle 08:30 senza riarmarla e il
  // recupero "avviso immediato" della v4.75 non poteva mai scattare.
  // Con l'inizio giornata la scadenza resta visibile per tutto il suo giorno.
  const inizioOggi = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate())
  const scadenze = await db.scadenza.findMany({
    where: {
      userId: user.id,
      pagata: false,
      dataScadenza: { gte: inizioOggi },
    },
    orderBy: { dataScadenza: 'asc' },
  })

  // Solo scadenze nel periodo di preavviso (banner "Scadenze imminenti").
  const imminenti = scadenze.filter(
    (s) => giorniMancanti(s.dataScadenza, oggi) <= s.anticipoGiorni
  )

  return NextResponse.json({
    scadenze: imminenti.map((s) => ({
      id: s.id,
      titolo: s.titolo,
      filePath: s.filePath,
      dataScadenza: s.dataScadenza,
      anticipoGiorni: s.anticipoGiorni,
      pagata: s.pagata,
    })),
  })
}
