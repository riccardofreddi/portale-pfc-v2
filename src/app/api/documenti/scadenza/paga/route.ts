/**
 * /api/documenti/scadenza/paga
 *
 * POST { filePath, pagata } → marca (o annulla) lo stato "pagata" di una scadenza.
 *
 * - Il CLIENTE può marcare solo le proprie scadenze (ricavate dal filePath
 *   Documenti/<username>/...). È il modo in cui il cliente fa sparire la
 *   scadenza dal banner ("ho pagato") e dall'archivio (v4.60: pulsante
 *   "Pagato" sulla riga del documento).
 * - L'ADMIN può marcare qualsiasi scadenza (finestra "Promemoria scadenza"
 *   in Gestione Clienti).
 *
 * v4.60: viene memorizzato CHI ha segnato il pagamento (pagataDa = username)
 * e QUANDO (pagataIl). Lo studio cosi' vede nella console se il pagamento è
 * arrivato dal cliente (compilato in automatico) o è stato segnato da lui.
 * Con pagata=true le notifiche si fermano ovunque: il cron salta le scadenze
 * pagate, il banner non le mostra e l'app cancella i promemoria locali.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, logAudit } from '@/lib/auth'
import { DEFAULT_ADMIN_USER } from '@/lib/pfc-utils'
import { sendPushToUser } from '@/lib/push'

export const dynamic = 'force-dynamic'
// Budget per l'invio push inline verso lo studio (stesso schema di /api/messaggi).
export const maxDuration = 30

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
    data: {
      pagata: nuovoStato,
      // v4.60: firma del pagamento. Al reset (annulla) si svuota tutto:
      // la scadenza torna "da pagare" come se niente fosse.
      pagataDa: nuovoStato ? session.sub : null,
      pagataIl: nuovoStato ? new Date() : null,
    },
  })

  // Squillo per lo studio: SOLO quando e' il CLIENTE a segnarla pagata (il
  // reset pagata=false non squilla, e nemmeno le azioni dell'admin). Try/catch:
  // un problema di push non deve mai far fallire l'azione del cliente.
  if (session.role === 'client' && nuovoStato) {
    try {
      await sendPushToUser(DEFAULT_ADMIN_USER, {
        title: 'Scadenza pagata',
        body: `${session.sub}: ha segnato come pagata "${existing.titolo}"`.slice(0, 100),
        url: '/?tab=clienti',
        tag: 'pfc-pagamento-cliente',
      })
    } catch (pushErr) {
      console.error('[scadenza/paga] push admin (ignorata):', pushErr)
    }
  }

  await logAudit(session.sub, nuovoStato ? 'SCADENZA_PAGATA' : 'SCADENZA_PAGATA_RESET', filePath)
  return NextResponse.json({
    ok: true,
    pagata: scadenza.pagata,
    pagataDa: scadenza.pagataDa,
    pagataIl: scadenza.pagataIl,
  })
}
