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
 *
 * v4.118 — GIORNO DELLA SCADENZA, logica unificata in un solo ramo:
 *  - campanella silenziosa sempre (una al giorno per file, guardia interna);
 *  - push "Scade OGGI" SOLO se: finestra aperta (dopo le 08:35 ora
 *    italiana, calcolata su Europe/Rome), il telefono NON ha confermato
 *    l'allarme locale (scadenze.allarme_locale_il di oggi) e la push non
 *    e' gia' consegnata oggi (guardia separata, type 'scadenza_oggi').
 *    Il vecchio requisito notificata && pushInviata e' VIA: prima chi non
 *    aveva ricevuto il preavviso non riceveva NIENTE il giorno stesso, e
 *    la guardia confondeva la campanella del mattino con la push.
 *  - gli scheduler restano: cron Vercel 06:00 UTC (preavvisi, la finestra
 *    chiusa lo tiene a campanelle) + chance GitHub Actions (06:05 riserva
 *    preavvisi, 07:45 e 08:30 UTC dentro la finestra). Una chance in
 *    ritardo si auto-corregge: dopo le 08:35 italiane qualunque giro
 *    tenta la push, le guardie rendono tutto idempotente.
 *
 * v4.84 — RETE DI SICUREZZA DEL PREAVVISO (caso Freddi 9/11/2026): nei
 * giorni di preavviso (anticipo dello studio + 10/3/1, stessa regola
 * dell'app: giorniDiPreavviso) e dentro la finestra del mattino (dopo le
 * 08:35 italiane), il server manda la push "⏰ Scade tra N giorni" SOLO se
 * la sveglia locale NON PUO' esistere, cioe' l'app non e' stata riaperta
 * dopo la creazione della scadenza (l'app ripresenta il token FCM a ogni
 * apertura: max fcm_tokens.updated_at = ultima apertura certa; la guardia
 * e' dentro notifyPreavvisoDiOggi). Chi apre l'app resta sulla sveglia
 * locale — un solo avviso, mai il doppione. UNA sola push di preavviso per
 * scadenza (flag pushInviata, significato storico v4.58): consegnata,
 * la guardia "notificata && pushInviata" salta i giorni successivi; non
 * consegnata, la chance dopo ritenta. Il contatore "preavvisi" nella
 * risposta e' additivo: il workflow GitHub continua a leggere "ok":true.
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  giorniDiPreavviso,
  giorniMancanti,
  notifyPreavvisoDiOggi,
  notifyScadenzaDiOggi,
  notifyScadenzaOggi,
  notifyScadenzaImminente,
  FINESTRA_PUSH_OGGI_MINUTI,
  oraItaliaMinuti,
} from '@/lib/scadenza-notify'

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
    const oggi = new Date()
    // Inizio della giornata corrente (00:00:00.000) così includiamo anche le
    // scadenze DI OGGI (la notifica piu importante: il giorno della scadenza).
    // Senza questo, una scadenza salvata a mezzanotte risulterebbe "prima" di
    // adesso e verrebbe saltata per sempre.
    const inizioOggi = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate())

    // v4.75 — Prendiamo TUTTE le scadenze non pagate con data odierna o
    // futura (senza il vecchio filtro OR: ora il giorno stesso e' gestito
    // nel loop, anche quando il preavviso e' gia' stato consegnato).
    const scadenze = await db.scadenza.findMany({
      where: {
        pagata: false,
        dataScadenza: { gte: inizioOggi },
      },
      include: { user: { select: { username: true, name: true, email: true } } },
    })

    let notificate = 0
    let pushInviate = 0
    let avvisiOggi = 0
    // v4.84 — quante push di preavviso "Scade tra N giorni" sono partite.
    let preavvisi = 0
    const dettagli: Array<{ filePath: string; titolo: string; giorni: number }> = []

    for (const s of scadenze) {
      const giorni = giorniMancanti(s.dataScadenza, oggi)
      if (giorni > s.anticipoGiorni) continue // ancora troppo presto

      // v4.118 — GIORNO DELLA SCADENZA: un solo ramo per TUTTE le scadenze
      // di oggi, con o senza preavviso consegnato.
      if (giorni === 0) {
        // Campanella silenziosa SEMPRE (una al giorno per file, guardia
        // interna a notifyScadenzaOggi): il giorno resta visibile dentro
        // l'app anche se la push non parte.
        await notifyScadenzaOggi({
          scadenzaId: s.id,
          userId: s.userId,
          username: s.user.username,
          titolo: s.titolo,
          filePath: s.filePath,
          dataScadenza: s.dataScadenza,
          oggi,
        })

        // Push "Scade OGGI": la riserva della sveglia locale, dentro la
        // finestra. Prima (v4.75-4.77) partiva solo con notificata &&
        // pushInviata e la guardia confondeva la campanella con la push:
        // chi non aveva ricevuto il preavviso restava SENZA AVVISI il
        // giorno stesso, e una campanella del mattino ammazzava la push.
        const finestraAperta = oraItaliaMinuti(oggi) >= FINESTRA_PUSH_OGGI_MINUTI
        const allarmeConfermatoOggi =
          s.allarmeLocaleIl != null && s.allarmeLocaleIl >= inizioOggi
        if (finestraAperta && !allarmeConfermatoOggi) {
          const esitoOggi = await notifyScadenzaDiOggi({
            scadenzaId: s.id,
            userId: s.userId,
            username: s.user.username,
            titolo: s.titolo,
            filePath: s.filePath,
            dataScadenza: s.dataScadenza,
            oggi,
          })
          pushInviate += esitoOggi.pushSent
          if (esitoOggi.pushSent > 0) {
            avvisiOggi++
            dettagli.push({ filePath: s.filePath, titolo: s.titolo, giorni })
          }
        }
        continue
      }

      // Preavviso gia' consegnato e NON e' il giorno della scadenza: qui
      // non c'e' niente da dire (v4.75: prima la query li escludeva gia').
      if (s.notificata && s.pushInviata) continue

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

      // v4.84 — RETE DI SICUREZZA DEL PREAVVISO. Il giorno e' uno dei giorni
      // di preavviso (stessa regola dell'app: anticipo dello studio + tacche
      // fisse 10/3/1) e siamo dopo le 08:35 italiane: la sveglia locale delle
      // 08:30 ha avuto il suo spazio. La push parte SOLO se la sveglia non
      // puo' esistere (app non riaperta dopo la creazione: guardia dentro
      // notifyPreavvisoDiOggi sul max fcm_tokens.updated_at) — chi apre
      // l'app resta sulla sveglia locale, un solo avviso. Una sola push di
      // preavviso per scadenza: consegnata, pushInviata=true e dal giro
      // dopo la guardia "notificata && pushInviata" in cima salta tutto.
      // Nota: qui pushInviata e' ancora false (la guardia in cima non ha
      // saltato), quindi il blocco gira al massimo fino alla prima push
      // consegnata.
      if (
        !s.pushInviata &&
        oraItaliaMinuti(oggi) >= FINESTRA_PUSH_OGGI_MINUTI &&
        giorniDiPreavviso(s.anticipoGiorni).includes(giorni)
      ) {
        const esitoPre = await notifyPreavvisoDiOggi({
          scadenzaId: s.id,
          userId: s.userId,
          username: s.user.username,
          titolo: s.titolo,
          filePath: s.filePath,
          dataScadenza: s.dataScadenza,
          giorniPrima: giorni,
          createdAt: s.createdAt,
          oggi,
        })
        pushInviate += esitoPre.pushSent
        if (esitoPre.pushSent > 0) {
          preavvisi++
          dettagli.push({ filePath: s.filePath, titolo: s.titolo, giorni })
        }
      }
    }

    console.log(
      `[CRON] scadenze notificate: ${notificate}/${scadenze.length} · ` +
        `push inviate: ${pushInviate} · preavvisi v4.84: ${preavvisi} · ` +
        `avvisi oggi: ${avvisiOggi} · ` +
        dettagli.map((d) => `${d.titolo} (${d.giorni}g)`).join(', ')
    )

    // v4.86 — REGISTRO DI GIRO (flight recorder): ogni giro — cron Vercel o
    // manuale — scrive in audit_log la riga "CRON_SCADENZE" (console Audit,
    // username "sistema") con la via usata e l'esito completo. Prima un giro
    // a vuoto non lasciava TRACCIA: alla domanda "il check e' girato oggi?"
    // si poteva rispondere solo cercando a indizi. La registrazione e' in
    // .catch(() => {}): se il registro fallisce, il check continua — il
    // recorder non puo' MAI rompere il motore che registra.
    await db.auditLog
      .create({
        data: {
          username: 'sistema',
          action: 'CRON_SCADENZE',
          detail:
            `ok via ${viaCron ? 'cron Vercel (Bearer)' : 'sessione admin (manuale)'} · ` +
            `controllate:${scadenze.length} notificate:${notificate} ` +
            `push:${pushInviate} preavvisi:${preavvisi} oggi:${avvisiOggi}`,
        },
      })
      .catch(() => {})

    return NextResponse.json({
      ok: true,
      controllate: scadenze.length,
      notificate,
      pushInviate,
      avvisiOggi,
      preavvisi,
      dettagli,
    })
  } catch (err) {
    console.error('[SCADENZE] errore check:', err)
    // v4.86 — anche l'errore lascia traccia in audit_log: un giro fallito
    // non puo' piu' morire nei log di Vercel che nessuno legge. La riga
    // ERRORE e' il campanello che accende la via di recupero (giro manuale
    // del check: provato con successo l'11/11/2026 alle 09:05).
    await db.auditLog
      .create({
        data: {
          username: 'sistema',
          action: 'CRON_SCADENZE',
          detail: `ERRORE: ${String(err).slice(0, 180)}`,
        },
      })
      .catch(() => {})
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
