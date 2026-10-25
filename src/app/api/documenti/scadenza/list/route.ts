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

  // v4.118 — Finestra della lista. Default (senza parametro): solo le
  // scadenze dentro il periodo di preavviso di ognuna, il comportamento
  // storico del banner "Scadenze imminenti" del web (nessun cliente vede
  // niente di nuovo). Con ?giorni=N (l'app RN passa 90) la lista si
  // allarga a N giorni: l'app arma le sveglie locali delle 08:30 per
  // TUTTE le scadenze conosciute, non solo per quelle della finestra di
  // preavviso — se il cliente non apre l'app per due settimane, gli
  // allarmi delle scadenze successive restano programmati lo stesso
  // (punto 4 della verifica del 25/10/2026). La forma della risposta non
  // cambia: cambia solo quante righe entrano.
  const giorniParam = Number(req.nextUrl.searchParams.get('giorni'))
  const giorniLista =
    Number.isInteger(giorniParam) && giorniParam > 0 && giorniParam <= 366
      ? giorniParam
      : null

  // Solo scadenze nel periodo di preavviso (banner "Scadenze imminenti"),
  // oppure nelle N giorni chiesti dall'app (?giorni=90).
  const imminenti = scadenze.filter((s) => {
    const giorni = giorniMancanti(s.dataScadenza, oggi)
    return giorniLista != null ? giorni <= giorniLista : giorni <= s.anticipoGiorni
  })

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
