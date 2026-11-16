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
 *
 * v4.88 — include anche gli STATI DI CONSEGNA (notificata / pushInviata /
 * emailInviata): il poll dell'archivio admin puo' cosi' aggiornare da solo
 * la pillola "consegnata / in attesa" accanto alla targhetta della
 * scadenza, senza riscaricare la lista file da R2, e aggiunge la targhetta
 * alle scadenze create mentre la pagina era aperta (es. caricamento dal
 * tab Invio Documenti).
 *
 * v4.89 — include anche allarmeLocaleIl: la conferma che la sveglia 08:30
 * e' scattata sul telefono del cliente (POST /api/documenti/scadenza/
 * allarme-confermato). E' la prova di consegna per i clienti con l'app,
 * su cui il server non spinge per design: la pillola verde "consegnata"
 * dell'archivio si accende anche per loro, non solo quando la push di
 * riserva e' partita.
 *
 * v4.91 — due novita' per la finestra "Promemoria scadenza":
 *  - ultimoCheck nella risposta (quando e come e' girato l'ultimo check
 *    delle scadenze, dal registro ultimo_check_scadenze): l'admin vede se
 *    la macchina e' viva e, per una scadenza di oggi ancora "in attesa",
 *    capisce se la push di riserva e' gia' stata tentata;
 *  - AUTO-GUARIGIONE dopo la risposta (after, best-effort): se il giro di
 *    OGGI manca ancora (cron Vercel perso, caso reale 11/11/2026) e sono
 *    passate le 10:00 italiane, il giro parte da qui. Guardia interna:
 *    una sola cura al giorno, e se il giro c'e' gia' tace.
 */
import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { forseRimedioGiroMancato, leggiUltimoGiro } from '@/lib/scadenze-check'

export const dynamic = 'force-dynamic'
// after() fa girare la cura del giro mancato DOPO la risposta: serve
// tempo a disposizione (il giro tocca tutto il database).
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const username = searchParams.get('username') ?? ''
  if (!username) return NextResponse.json({ error: 'Username mancante' }, { status: 400 })

  const user = await db.user.findUnique({ where: { username }, select: { id: true } })
  if (!user) return NextResponse.json({ scadenze: [], ultimoCheck: null })

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
      notificata: true,
      pushInviata: true,
      emailInviata: true,
      // v4.89: quando il telefono ha confermato la sveglia 08:30 del giorno
      // della scadenza (POST allarme-confermato): la prova di consegna per
      // i clienti con l'app, su cui il server non spinge per design.
      allarmeLocaleIl: true,
    },
  })

  // v4.91 — auto-guarigione: se il giro di oggi manca (cron perso) e sono
  // passate le 10:00 italiane, lo faccio partire dopo la risposta, senza
  // rallentare il poll da 30 secondi. Best-effort: non puo' rompere nulla.
  after(async () => {
    await forseRimedioGiroMancato('piggyback scadenza/tutte')
  })

  // v4.91 — il registro di giro per la finestra Promemoria (vedi il
  // commento in testa): null se il check non ha mai girato.
  const ultimoCheck = await leggiUltimoGiro()
  return NextResponse.json({ scadenze, ultimoCheck })
}
