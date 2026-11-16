/**
 * /api/scadenze/check
 *
 * Job schedulato (Vercel Cron, 1 volta/giorno — vercel.json 09:15 UTC =
 * 10:15 ora italiana solare) che avvisa i clienti delle scadenze imminenti.
 *
 * v4.91 — TUTTA LA LOGICA VIVE IN src/lib/scadenze-check.ts: qui restano
 * solo l'autenticazione e l'incarto HTTP. Il motivo dell'estrazione e'
 * l'AUTO-GUARIGIONE: il giro del cron a volte si perde (caso reale
 * 11/11/2026, risolto allora con un giro manuale), quindi da oggi anche
 * il poll dell'archivio admin (/api/documenti/scadenza/tutte) e il
 * Resoconto possono farlo partire con forseRimedioGiroMancato() quando il
 * giro di oggi manca ancora ed e' passata la finestra delle 10:00
 * italiane. La logica di consegna NON e' cambiata:
 *  - giorno della scadenza: campanella silenziosa sempre + push "Scade
 *    OGGI" dopo le 10:00 italiane SOLO se il telefono non ha confermato
 *    l'allarme locale (allarme_locale_il di oggi, v4.118/v4.87/v4.90);
 *  - giorni di preavviso (anticipo dello studio + tacche 10/3/1, regola
 *    UNA giorniDiPreavviso): campanella + email di cortesia per chi non
 *    ha canali push; push "Scade tra N giorni" SOLO se la sveglia locale
 *    non puo' esistere (app non riaperta dopo la creazione, v4.84);
 *  - una sola push per scadenza (pushInviata), una campanella al giorno
 *    per file: sovrapporsi con un altro giro e' innocuo.
 *
 * Autenticazione: Bearer CRON_SECRET (come /api/push/retry). Se assente, richiede
 * sessione admin (utile per test manuali).
 *
 * NOTA: Vercel chiama i cron job con una richiesta GET (non POST). Esponiamo
 * entrambi i metodi verso la stessa logica, così funziona sia il cron automatico
 * di produzione (GET) sia i test manuali (POST con Bearer).
 */
import { NextRequest, NextResponse } from 'next/server'
import { eseguiCheckScadenze, registraGiro } from '@/lib/scadenze-check'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

// Logica condivisa tra GET (cron Vercel) e POST (test manuali).
async function runCheck(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization')
  const providedSecret = authHeader?.replace('Bearer ', '')
  // v4.86 — come e' stato chiamato questo giro: Bearer (cron Vercel) o
  // sessione admin (test manuale). Serve alla riga di registro in fondo.
  const viaCron = Boolean(providedSecret && CRON_SECRET && providedSecret === CRON_SECRET)
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
    const esito = await eseguiCheckScadenze(
      viaCron ? 'cron Vercel (Bearer)' : 'sessione admin (manuale)'
    )
    return NextResponse.json({ ok: true, ...esito })
  } catch (err) {
    console.error('[SCADENZE] errore check:', err)
    // Anche l'errore lascia traccia (nella riga unica di system_settings,
    // non in audit_log): un giro fallito non puo' morire nei log di Vercel
    // che nessuno legge. La voce ERRORE e' il campanello che accende la
    // via di recupero (giro manuale del check: provato con successo
    // l'11/11/2026 alle 09:05).
    await registraGiro(`ERRORE: ${String(err).slice(0, 180)}`)
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
