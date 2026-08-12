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
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendPushToUser } from '@/lib/push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

function giorniMancanti(data: Date, oggi: Date): number {
  const msAlGiorno = 24 * 60 * 60 * 1000
  const d1 = Math.floor(data.getTime() / msAlGiorno)
  const d0 = Math.floor(oggi.getTime() / msAlGiorno)
  return d1 - d0
}

export async function POST(req: NextRequest) {
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
        dataScadenza: { gte: oggi },
      },
      include: { user: { select: { username: true, name: true } } },
    })

    let notificate = 0
    const dettagli: Array<{ filePath: string; titolo: string; giorni: number }> = []

    for (const s of scadenze) {
      const giorni = giorniMancanti(s.dataScadenza, oggi)
      if (giorni > s.anticipoGiorni) continue // ancora troppo presto

      const quando =
        giorni <= 0 ? 'scade oggi' : `scade tra ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}`
      const text = `${s.titolo}: ${quando} (${s.dataScadenza.toLocaleDateString('it-IT')})`

      // Notifica in campanella (tipo 'scadenza').
      await db.notification.create({
        data: {
          userId: s.userId,
          type: 'scadenza',
          text,
          detail: s.filePath,
        },
      })

      // Push (arriva anche se il client non è loggato: la gestisce il Service Worker).
      await sendPushToUser(s.user.username, {
        title: '⏰ Scadenza imminente',
        body: text,
        url: '/',
        tag: 'pfc-scadenza-' + s.id,
      }).catch((e) => console.error('[SCADENZE] push errore:', e))

      await db.scadenza.update({ where: { id: s.id }, data: { notificata: true } })

      notificate++
      dettagli.push({ filePath: s.filePath, titolo: s.titolo, giorni })
    }

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
