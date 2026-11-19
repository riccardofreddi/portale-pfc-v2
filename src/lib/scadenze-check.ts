/**
 * Motore del check giornaliero delle scadenze (v4.91).
 *
 * Fino alla v4.90 tutta la logica viveva dentro /api/scadenze/check e non
 * era raggiungibile da altre vie: se il cron Vercel delle 10:15 italiane
 * perdeva il giro (succede, caso reale 11/11/2026 risolto a mano), l'unica
 * cura era il giro manuale con Bearer. Da oggi il motore e' una libreria:
 *  - eseguiCheckScadenze(via)      -> il giro completo (campanelle, preavvisi,
 *                                     push di riserva "Scade OGGI");
 *  - forseRimedioGiroMancato(via)  -> AUTO-GUARIGIONE: se il giro di oggi
 *                                     manca ancora e sono passate le 10:00
 *                                     italiane, lo fa partire chi ospita la
 *                                     chiamata (poll dell'archivio admin,
 *                                     resoconto). Idempotente: legge il
 *                                     registro ultimo_check_scadenze e tace
 *                                     se oggi e' gia' girato (cron o piggyback);
 *                                     tutte le guardie interne (lease dello
 *                                     slot push, campanella al giorno,
 *                                     pushInviata) rendono comunque innocua
 *                                     la sovrapposizione col cron.
 *  - leggiUltimoGiro()             -> il registro di giro per la finestra
 *                                     "Promemoria scadenza" dell'admin.
 *
 * L'auto-guarigione parte SOLO dopo le 10:00 italiane (FINESTRA_PUSH_OGGI_
 * MINUTI): prima di quell'ora un giro non potrebbe mandare la push di
 * riserva (finestra chiusa) e "brucerebbe" il rimedio del giorno scrivendo
 * il registro senza aver consegnato nulla.
 */
import { db } from './db'
import {
  giorniDiPreavviso,
  giorniMancanti,
  notifyPreavvisoDiOggi,
  notifyScadenzaDiOggi,
  notifyScadenzaOggi,
  notifyScadenzaImminente,
  FINESTRA_PUSH_OGGI_MINUTI,
  oraItaliaMinuti,
} from './scadenza-notify'
import {
  campanellaLetta,
  chiudiRegistroSveglie,
  testoEsitoOggi,
  testoEsitoPreavviso,
  type StatoPush,
  type VoceDelGiro,
} from './sveglie-registro'

// v4.87 — REGISTRO DI GIRO FUORI DALL'ARCHIVIO: niente piu' righe
// CRON_SCADENZE in audit_log (v4.86 ne scriveva una a ogni giro: dopo pochi
// giorni l'archivio log attivita' si riempiva di voci "sistema" che il
// titolare non vuole e che occupano DB). Il registro vive in
// system_settings, chiave "ultimo_check_scadenze", SEMPRE una riga sola
// riscritta a ogni giro (upsert): crescita zero, diagnosi identica. In piu'
// ogni giro PULISCE le vecchie righe CRON_SCADENZE rimaste dal v4.86.
// Errori inclusi: la riga unica diventa "ERRORE: ..." fino al primo giro
// riuscito. Tutte le scritture sono best-effort: il recorder non puo' MAI
// rompere il motore che registra.
export async function registraGiro(detail: string) {
  const valore = JSON.stringify({ ts: new Date().toISOString(), detail })
  try {
    await db.systemSetting.upsert({
      where: { key: 'ultimo_check_scadenze' },
      update: { value: valore },
      create: { key: 'ultimo_check_scadenze', value: valore },
    })
  } catch {
    // il registro non puo' rompere il check
  }
  try {
    // v4.87 — auto-pulizia: le righe storiche del registro v4.86 escono
    // dall'archivio (il primo giro dopo il deploy le cancella; dai giri
    // dopo, la deleteMany trova 0 righe e costa nulla).
    await db.auditLog.deleteMany({ where: { action: 'CRON_SCADENZE' } })
  } catch {
    // idem
  }
}

// Giorno (giorno/mese/anno) secondo l'OROLOGIO ITALIANO: il confronto
// "il giro di oggi e' gia' passato?" deve usare la stessa citta' del
// titolare, non l'UTC del server (a mezzanotte +1 l'Italia e' cambiata
// giorno, l'UTC no).
function dataItalia(d: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export type EsitoCheck = {
  controllate: number
  notificate: number
  pushInviate: number
  avvisiOggi: number
  preavvisi: number
  dettagli: Array<{ filePath: string; titolo: string; giorni: number }>
}

/**
 * Il giro completo del check: STESSA logica della v4.90, intoccata.
 *  - scadenza di oggi: campanella silenziosa sempre + push "Scade OGGI"
 *    dentro la finestra (dopo le 10:00 italiane) e solo se il telefono non
 *    ha confermato l'allarme locale di oggi (v4.118/v4.87);
 *  - giorni di preavviso (giorniDiPreavviso: anticipo + tacche 10/3/1):
 *    campanella + email di cortesia per chi non ha canali push, push
 *    "Scade tra N giorni" SOLO se la sveglia locale non puo' esistere
 *    (app non riaperta dopo la creazione della scadenza, guardia dentro
 *    notifyPreavvisoDiOggi);
 *  - una sola push per scadenza (pushInviata) e una campanella al giorno
 *    per file: sovrapporsi con un altro giro e' innocuo.
 */
export async function eseguiCheckScadenze(via: string): Promise<EsitoCheck> {
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
  // v4.95 — REGISTRO SVEGLIE: una voce per OGNI sveglia del piano processata
  // in questo giro (g = 10/3/1/anticipo oppure 0 = giorno stesso), cosi'
  // l'admin vede la storia completa delle 4 sveglie, non solo il flag
  // notificata scritto una volta (vedi sveglie-registro.ts).
  const vociSveglie: VoceDelGiro[] = []

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
      let pushOggi: StatoPush = 'none'
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
        pushOggi = esitoOggi.pushSent > 0 ? 'consegnata' : 'fallita'
        if (esitoOggi.pushSent > 0) {
          avvisiOggi++
          dettagli.push({ filePath: s.filePath, titolo: s.titolo, giorni })
        }
      } else if (allarmeConfermatoOggi) {
        pushOggi = 'taciuta-sveglia'
      }
      // v4.95 — voce del registro per la sveglia del giorno stesso + prova
      // campanella letta (il cliente l'ha aperta in app).
      vociSveglie.push({
        filePath: s.filePath,
        titolo: s.titolo,
        dataScadenza: s.dataScadenza,
        anticipo: s.anticipoGiorni,
        g: 0,
        esito: testoEsitoOggi(pushOggi),
        letta: await campanellaLetta(s.userId, s.filePath),
      })
      continue
    }

    // Preavviso gia' consegnato e NON e' il giorno della scadenza: qui
    // non c'e' niente da dire (v4.75: prima la query li escludeva gia').
    // v4.95 — ma il giro che TACE registra comunque la sua sveglia quando
    // il giorno e' uno dei giorni di piano: la push di rete e' arrivata in
    // un giorno di piano precedente, quindi il server tace di proposito
    // (un avviso solo) e la voce del registro dice la verita' completa.
    if (s.notificata && s.pushInviata) {
      if (giorniDiPreavviso(s.anticipoGiorni).includes(giorni)) {
        vociSveglie.push({
          filePath: s.filePath,
          titolo: s.titolo,
          dataScadenza: s.dataScadenza,
          anticipo: s.anticipoGiorni,
          g: giorni,
          esito: testoEsitoPreavviso({
            campanellaCreata: false,
            push: 'gia-consegnata',
            giorni,
            emailInviata: false,
          }),
          letta: await campanellaLetta(s.userId, s.filePath),
        })
      }
      continue
    }

    const { notified, pushSent, campanellaCreata, emailSent } = await notifyScadenzaImminente({
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
    // fisse 10/3/1) e siamo dopo le 10:00 italiane (v4.87): la sveglia
    // locale delle 08:30 e il giro mattutino hanno avuto il loro spazio.
    // La push parte SOLO se la sveglia non
    // puo' esistere (app non riaperta dopo la creazione: guardia dentro
    // notifyPreavvisoDiOggi sul max fcm_tokens.updated_at) — chi apre
    // l'app resta sulla sveglia locale, un solo avviso. Una sola push di
    // preavviso per scadenza: consegnata, pushInviata=true e dal giro
    // dopo la guardia "notificata && pushInviata" in cima salta tutto.
    // Nota: qui pushInviata e' ancora false (la guardia in cima non ha
    // saltato), quindi il blocco gira al massimo fino alla prima push
    // consegnata.
    const giornoPiano = giorniDiPreavviso(s.anticipoGiorni).includes(giorni)
    let esitoPre: Awaited<ReturnType<typeof notifyPreavvisoDiOggi>> | null = null
    if (
      !s.pushInviata &&
      oraItaliaMinuti(oggi) >= FINESTRA_PUSH_OGGI_MINUTI &&
      giornoPiano
    ) {
      esitoPre = await notifyPreavvisoDiOggi({
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

    // v4.95 — voce del registro SOLO per le sveglie del PIANO (i giorni
    // 10/3/1/anticipo, le stesse della sveglia 8:30): i giorni intermedi
    // (es. g=2) non sono sveglie e non entrano nella storia.
    if (giornoPiano) {
      let pushPre: StatoPush = 'none'
      if (esitoPre) {
        pushPre =
          esitoPre.motivo === 'sveglia-armata'
            ? 'taciuta-sveglia'
            : esitoPre.pushSent > 0
              ? 'consegnata'
              : 'fallita'
      }
      vociSveglie.push({
        filePath: s.filePath,
        titolo: s.titolo,
        dataScadenza: s.dataScadenza,
        anticipo: s.anticipoGiorni,
        g: giorni,
        esito: testoEsitoPreavviso({
          campanellaCreata: campanellaCreata === true,
          push: pushPre,
          giorni,
          emailInviata: emailSent === true,
        }),
        letta: await campanellaLetta(s.userId, s.filePath),
      })
    }
  }

  console.log(
    `[CRON] scadenze notificate: ${notificate}/${scadenze.length} · ` +
      `push inviate: ${pushInviate} · preavvisi v4.84: ${preavvisi} · ` +
      `avvisi oggi: ${avvisiOggi} · ` +
      dettagli.map((d) => `${d.titolo} (${d.giorni}g)`).join(', ')
  )

  // v4.95 — CHIUSURA REGISTRO SVEGLIE: pulizia + unione delle voci di
  // questo giro + scrittura (best-effort: non puo' rompere il giro).
  await chiudiRegistroSveglie(vociSveglie)

  // v4.87 — REGISTRO DI GIRO: riga unica in system_settings (vedi
  // registraGiro sopra) + auto-pulizia delle vecchie righe audit_log.
  await registraGiro(
    `ok via ${via} · ` +
      `controllate:${scadenze.length} notificate:${notificate} ` +
      `push:${pushInviate} preavvisi:${preavvisi} oggi:${avvisiOggi} ` +
      `sveglie:${vociSveglie.length}`
  )

  return {
    controllate: scadenze.length,
    notificate,
    pushInviate,
    avvisiOggi,
    preavvisi,
    dettagli,
  }
}

/**
 * v4.91 — AUTO-GUARIGIONE DEL GIRO MANCATO. Se il giro di OGGI non c'e'
 * (cron Vercel perso o in ritardo, caso reale 11/11/2026) e sono passate
 * le 10:00 italiane, il primo accesso dell'admin al portale (poll
 * dell'archivio Gestione Clienti, apertura del Resoconto) fa partire il
 * giro completo. Chiamata pensata per after(): non rallenta la risposta
 * che la ospita e non puo' romperla (tutto best-effort). Se il giro di
 * oggi c'e' gia' (cron o un altro piggyback) tace: una sola cura al giorno.
 */
export async function forseRimedioGiroMancato(via: string): Promise<void> {
  try {
    // Prima delle 10:00 italiane la finestra push e' chiusa: un giro ora
    // non consegnerebbe la riserva e scriveremmo "giro fatto" senza aver
    // consegnato niente. Il cron delle 10:15 (o un piggyback piu' tardi)
    // pensi a noi.
    if (oraItaliaMinuti() < FINESTRA_PUSH_OGGI_MINUTI) return
    const setting = await db.systemSetting.findUnique({
      where: { key: 'ultimo_check_scadenze' },
      select: { value: true },
    })
    if (setting?.value) {
      try {
        const parsed = JSON.parse(setting.value) as { ts?: string }
        if (parsed.ts && dataItalia(new Date(parsed.ts)) === dataItalia(new Date())) {
          return // oggi e' gia' girato (cron o piggyback precedente)
        }
      } catch {
        // registro illeggibile: procediamo col giro, lo riscrive pulito
      }
    }
    await eseguiCheckScadenze(via)
  } catch {
    // il rimedio non puo' rompere la richiesta che lo ospita
  }
}

/**
 * v4.91 — Il registro di giro per la finestra "Promemoria scadenza":
 * quando e come e' girato l'ultimo check (data/ora ISO + riga di esito).
 * Null se non c'e' ancora nessun registro (mai girato da quando esiste la
 * v4.87) o e' illeggibile.
 */
export async function leggiUltimoGiro(): Promise<{ ts: string; detail: string } | null> {
  try {
    const setting = await db.systemSetting.findUnique({
      where: { key: 'ultimo_check_scadenze' },
      select: { value: true },
    })
    if (!setting?.value) return null
    const parsed = JSON.parse(setting.value) as { ts?: string; detail?: string }
    if (!parsed.ts) return null
    return { ts: parsed.ts, detail: parsed.detail ?? '' }
  } catch {
    return null
  }
}
