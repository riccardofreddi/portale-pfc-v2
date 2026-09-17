/**
 * /api/cron/pulizia-token   (v4.59)
 *
 * Job schedulato (Vercel Cron, 1 volta/giorno di notte) che CONTROLLA DAVVERO
 * se i telefoni registrati sono ancora collegati, e cancella dall'elenco
 * quelli morti (app disinstallata / token revocato da Google).
 *
 * Perche' serve: quando un cliente disinstalla e reinstalla l'app, il telefono
 * vecchio resta nell'elenco finche' un invio non scopre che e' morto. In quel
 * lasso di tempo il Resoconto puo' mostrare "2 telefoni" quando in realta' il
 * cliente ne ha 1. Con questo controllo notturno il numero del Resoconto e'
 * sempre la verita'.
 *
 * Come funziona: per ogni token FCM chiediamo a Google se e' ancora valido
 * usando la "dry run" (validazione SENZA consegna: il cliente non riceve
 * nessuna notifica). I token morti vengono cancellati; gli errori temporanei
 * NON cancellano nulla (prudenza).
 *
 * Nota onesta: le iscrizioni del BROWSER (Web Push) non si possono controllare
 * senza inviare davvero qualcosa: quelle vengono ripulite da sole quando un
 * invio vero fallisce (404/410), come gia' succede oggi.
 *
 * Autenticazione: Bearer CRON_SECRET (come /api/scadenze/check); in assenza,
 * richiede sessione admin (utile per test manuali dal browser).
 * Vercel chiama i cron con GET; esponiamo anche POST per i test manuali.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validaTokenFcm } from '@/lib/fcm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

async function runPulizia(req: NextRequest): Promise<NextResponse> {
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
    const tokens = await db.fcmToken.findMany({
      select: { token: true, device: true },
      orderBy: { updatedAt: 'asc' },
    })

    const morti: string[] = []
    for (const t of tokens) {
      const vivo = await validaTokenFcm(t.token)
      if (!vivo) morti.push(t.token)
    }

    if (morti.length > 0) {
      await db.fcmToken.deleteMany({ where: { token: { in: morti } } })
    }

    console.log(
      `[CRON-PULIZIA-TOKEN] controllati ${tokens.length}, rimossi ${morti.length}, rimasti ${tokens.length - morti.length}`
    )
    return NextResponse.json({
      ok: true,
      controllati: tokens.length,
      rimossi: morti.length,
      rimasti: tokens.length - morti.length,
    })
  } catch (err) {
    console.error('[CRON-PULIZIA-TOKEN] errore:', err)
    return NextResponse.json({ error: 'Errore server' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return runPulizia(req)
}

export async function POST(req: NextRequest) {
  return runPulizia(req)
}
