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
    // Prendiamo tutte le scadenze non ancora notificate con data futura (o oggi).
    const scadenze = await db.scadenza.findMany({
      where: {
        notificata: false,
        pagata: false,
        dataScadenza: { gte: oggi },
      },
      include: { user: { select: { username: true, name: true } } },
    })

    let notificate = 0
    const dettagli: Array<{ filePath: string; titolo: string; giorni: number }> = []

    for (const s of scadenze) {
      const giorni = giorniMancanti(s.dataScadenza, oggi)
      if (giorni > s.anticipoGiorni) continue // ancora troppo presto

      const { notified } = await notifyScadenzaImminente({
        scadenzaId: s.id,
        userId: s.userId,
        username: s.user.username,
        titolo: s.titolo,
        filePath: s.filePath,
        dataScadenza: s.dataScadenza,
        anticipoGiorni: s.anticipoGiorni,
        pagata: s.pagata,
        oggi,
      })
      if (!notified) continue

      notificate++
      dettagli.push({ filePath: s.filePath, titolo: s.titolo, giorni })
    }

    console.log(
      `[CRON] scadenze notificate: ${notificate}/${scadenze.length} · ` +
        dettagli.map((d) => `${d.titolo} (${d.giorni}g)`).join(', ')
    )

    return NextResponse.json({
      ok: true,
      controllate: scadenze.length,
      notificate,
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
