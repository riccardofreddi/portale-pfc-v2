/**
 * /api/documenti/scadenza/allarme-confermato
 *
 * POST { scadenzaId } — FEEDBACK telefono→server (v4.118).
 *
 * L'app, quando l'avviso locale del giorno di scadenza è stato EROGATO
 * (sveglia delle 08:30 nel vassoio, toccata, o avviso immediato di
 * recupero), lo dice qui al server. Il segno resta su
 * scadenze.allarme_locale_il; il ramo del giorno stesso del cron
 * (/api/scadenze/check) NON manda la push di riserva "Scade OGGI" se la
 * conferma è di OGGI: l'utente è già stato avvisato, un avviso solo.
 *
 * Perché fire-and-forget lato app: se la richiesta non arriva (rete giù,
 * app chiusa a quel momento), il server NON sa nulla e la push di riserva
 * parte lo stesso. Al peggio un doppione percepito, MAI il silenzio: la
 * rete di sicurezza non si spegne per un feedback mancante.
 *
 * Autenticazione: sessione (cookie, come /api/documenti/scadenza/list).
 * Il cliente può confermare SOLO le proprie scadenze.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { username: session.sub },
    select: { id: true },
  })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as { scadenzaId?: unknown }
  const scadenzaId = typeof body.scadenzaId === 'string' ? body.scadenzaId : ''
  if (!scadenzaId) {
    return NextResponse.json({ error: 'scadenzaId mancante' }, { status: 400 })
  }

  const scadenza = await db.scadenza.findUnique({
    where: { id: scadenzaId },
    select: { id: true, userId: true },
  })
  if (!scadenza || scadenza.userId !== user.id) {
    return NextResponse.json({ error: 'Scadenza non trovata' }, { status: 404 })
  }

  await db.scadenza.update({
    where: { id: scadenzaId },
    data: { allarmeLocaleIl: new Date() },
  })

  return NextResponse.json({ ok: true })
}
