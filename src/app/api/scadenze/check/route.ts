/**
 * /api/scadenze/check
 *
 * Job schedulato (Vercel Cron / cron esterno, 1 volta/giorno) che avvisa i
 * clienti delle scadenze imminenti. Per ogni scadenza non ancora notificata il
 * cui giorno mancante è <= anticipoGiorni, crea una Notification (campanella)
 * e invia la push (arriva anche a client chiuso/non loggato, gestita dal SW).
 *
 * Autenticazione: Bearer CRON_SECRET (come /api/push/retry). Se assente, richiede
 * sessione admin (utile per test manuali).
 *
 * NOTA: Vercel chiama i cron job con una richiesta GET (non POST). Esponiamo
 * entrambi i metodi verso la stessa logica, così funziona sia il cron automatico
 * di produzione (GET) sia i test manuali (POST con Bearer).
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { giorniMancanti, notifyScadenzaImminente } from '@/lib/scadenza-notify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

// Logica condivisa tra GET (cron Vercel) e POST (test manuali).
async function runCheck(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization')
  const providedSecret = authHeader?.replace('Bearer ', '')
  if (providedSecret && providedSecret === CRON_SECRET) {
    // OK, cron
  } else {
    const { getSession } = await import('@/lib/auth')
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }
  }

  try {
    const oggi = new Date()
    // Inizio della giornata corrente (00:00:00.000) così includiamo anche le
    // scadenze DI OGGI (la notifica piu importante: il giorno della scadenza).
    // Senza questo, una scadenza salvata a mezzanotte risulterebbe "prima" di
    // adesso e verrebbe saltata per sempre.
    const inizioOggi = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate())

    // Prendiamo tutte le scadenze non pagate con data odierna o futura, che
    // hanno la campanella non ancora creata OPPURE la push non ancora consegnata
    // (cosi il cron ritenta la push giorno dopo giorno finche non arriva).
    const scadenze = await db.scadenza.findMany({
      where: {
        pagata: false,
        dataScadenza: { gte: inizioOggi },
        OR: [{ notificata: false }, { pushInviata: false }],
      },
      include: { user: { select: { username: true, name: true, email: true } } },
    })

    let notificate = 0
    let pushInviate = 0
    const dettagli: Array<{ filePath: string; titolo: string; giorni: number }> = []

    for (const s of scadenze) {
      const giorni = giorniMancanti(s.dataScadenza, oggi)
      if (giorni > s.anticipoGiorni) continue // ancora troppo presto

      const { notified, pushSent } = await notifyScadenzaImminente({
        scadenzaId: s.id,
        userId: s.userId,
        username: s.user.username,
        titolo: s.titolo,
        filePath: s.filePath,
        dataScadenza: s.dataScadenza,
        anticipoGiorni: s.anticipoGiorni,
        pagata: s.pagata,
        oggi,
        emailCliente: s.user.email,
      })
      if (!notified) continue

      notificate++
      pushInviate += pushSent
      dettagli.push({ filePath: s.filePath, titolo: s.titolo, giorni })
    }

    console.log(
      `[CRON] scadenze notificate: ${notificate}/${scadenze.length} · ` +
        `push inviate: ${pushInviate} · ` +
        dettagli.map((d) => `${d.titolo} (${d.giorni}g)`).join(', ')
    )

    return NextResponse.json({
      ok: true,
      controllate: scadenze.length,
      notificate,
      pushInviate,
      dettagli,
    })
  } catch (err) {
    console.error('[SCADENZE] errore check:', err)
    return NextResponse.json({ error: 'Errore server', detail: String(err) }, { status: 500 })
  }
}

// Cron automatico di Vercel (richiesta GET).
export async function GET(req: NextRequest) {
  return runCheck(req)
}

// Test manuali (richiesta POST con Authorization: Bearer CRON_SECRET).
export async function POST(req: NextRequest) {
  return runCheck(req)
}
