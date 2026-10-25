/**
 * Notifiche promemoria scadenze: campanella in-app + Web Push (anche a client
 * non loggato, gestita dal Service Worker). Usato da upload, gestione clienti
 * e cron giornaliero.
 *
 * v4.75b — file identico alla v4.63 (consegna per canale v4.58, niente push
 * il giorno stesso v4.62, niente email il giorno stesso v4.63) + IN CODA la
 * nuova push dedicata "Scade OGGI" (notifyScadenzaDiOggi) che il cron usa
 * il giorno della scadenza quando il preavviso e' gia' stato consegnato:
 * e' la rete di sicurezza per l'allarme locale 8:30 perso dall'Android
 * (caso reale 24/9/2026). Tutto il resto non e' toccato.
 *
 * v4.118 — IL GIORNO STESSO FUNZIONA DAVVERO, UN AVVISO ALLA VOLTA:
 *  - la push "Scade OGGI" parte SOLO dentro la finestra dopo le 08:35 ora
 *    italiana (FINESTRA_PUSH_OGGI_MINUTI + oraItaliaMinuti): la sveglia
 *    locale delle 08:30 ha sempre il campo libero, la push entra come
 *    riserva dopo di lei, non piu' "quando capitava" (21/9/2026: 14:38);
 *  - parte anche se il preavviso non e' mai stato consegnato (prima il
 *    ramo del cron richiedeva notificata && pushInviata: chi non aveva
 *    ricevuto il preavviso non riceveva NIENTE il giorno stesso);
 *  - il telefono puo' CONFERMARE l'allarme locale (POST
 *    /api/documenti/scadenza/allarme-confermato, colonna
 *    scadenze.allarme_locale_il): con la conferma di oggi la push di
 *    riserva tace — un avviso solo, mai il doppione;
 *  - le guardie campanella e push sono SEPARATE: prima "campanella creata
 *    oggi" bloccava anche la push (verifica del 25/10/2026);
 *  - le push portano ora &documento= nel deep-link: toccandole l'app si
 *    apre direttamente sul file in scadenza (come le sveglie locali dalla
 *    v4.6), non solo sulla cartella.
 */
import { db } from './db'
import { sendPushToUserCanali } from './push'
import { sendEmail } from './email'

/**
 * v4.118 — Finestra della push "Scade OGGI": la push del giorno stesso parte
 * SOLO a partire dalle 08:35 ora italiana (Europe/Rome). Prima il cron
 * sparava a qualunque ora gli capitasse (le chance di riserva su GitHub
 * partono con ritardi di ore) e la sveglia locale delle 08:30 rischiava il
 * doppione; ora lei ha il campo libero e la push entra dopo.
 */
export const FINESTRA_PUSH_OGGI_MINUTI = 8 * 60 + 35 // 08:35

/**
 * v4.78c — Lease dello slot push "Scade OGGI": se un pending 'scadenza_oggi'
 * e' piu' giovane di cosi', un altro giro sta pushando ORA e tacciamo. Un
 * pending piu' vecchio e' un giro morto (crash tra presa e chiusura): lo
 * slot si riprende e la push riparte. 10 minuti e' ben sotto la distanza
 * tra le chance (45 min) e ben sopra la durata di un giro (maxDuration 60s).
 */
export const LEASE_PUSH_OGGI_MINUTI = 10

/**
 * Minuti trascorsi da mezzanotte secondo l'OROLOGIO ITALIANO (Europe/Rome).
 * Il server vive in UTC: su Vercel new Date().getHours() e' l'ora UTC, che
 * cambia con l'ora legale (08:35 it. solare = 07:35 UTC, legale = 06:35).
 * Intl con timeZone rende la finestra corretta tutto l'anno, senza
 * librerie esterne.
 */
export function oraItaliaMinuti(oggi: Date = new Date()): number {
  const parti = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(oggi)
  const ore = Number(parti.find((p) => p.type === 'hour')?.value ?? '0')
  const minuti = Number(parti.find((p) => p.type === 'minute')?.value ?? '0')
  return ore * 60 + minuti
}

export function giorniMancanti(data: Date, oggi: Date): number {
  const msAlGiorno = 24 * 60 * 60 * 1000
  const d1 = Math.floor(data.getTime() / msAlGiorno)
  const d0 = Math.floor(oggi.getTime() / msAlGiorno)
  return d1 - d0
}

export function isScadenzaImminente(
  dataScadenza: Date,
  anticipoGiorni: number,
  pagata: boolean,
  oggi = new Date()
): boolean {
  if (pagata) return false
  return giorniMancanti(dataScadenza, oggi) <= anticipoGiorni
}

export function buildScadenzaNotificaText(titolo: string, dataScadenza: Date, oggi = new Date()): string {
  const giorni = giorniMancanti(dataScadenza, oggi)
  const quando = giorni <= 0 ? 'scade oggi' : `scade tra ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}`
  return `${titolo}: ${quando} (${dataScadenza.toLocaleDateString('it-IT')})`
}

/**
 * URL deep-link per aprire l'archivio sulla cartella del documento in
 * scadenza.
 * v4.118 — entra anche &documento= (tutto cio' che segue anno/cartella,
 * "nome.pdf" o "Sotto/nome.pdf" per le sottocartelle): toccando la push
 * l'app si apre DIRETTAMENTE sul documento in scadenza, non solo sulla
 * cartella. Stessa costruzione di partiFilePath dell'app (v4.6): il
 * risolutore dell'Archivio riconosce il parametro da li'. Percorso non
 * riconoscibile = fallback alla sola cartella (comportamento vecchio).
 */
export function scadenzaPushUrl(filePath: string): string {
  const parts = filePath.split('/')
  const anno = parts[2]
  const cartella = parts[3]
  const documento = parts.slice(4).join('/')
  if (anno && cartella && documento) {
    return (
      `/?tab=archivio&anno=${encodeURIComponent(anno)}` +
      `&cartella=${encodeURIComponent(cartella)}` +
      `&documento=${encodeURIComponent(documento)}`
    )
  }
  if (anno && cartella) {
    return `/?tab=archivio&anno=${encodeURIComponent(anno)}&cartella=${encodeURIComponent(cartella)}`
  }
  return '/?tab=archivio'
}

export async function notifyScadenzaImminente(params: {
  scadenzaId: string
  userId: string
  username: string
  titolo: string
  filePath: string
  dataScadenza: Date
  anticipoGiorni?: number
  pagata?: boolean
  /** Se true, forza la (ri)creazione della notifica campanella anche se gia presente. */
  forceNotifica?: boolean
  oggi?: Date
  /** Email del cliente (da User.email). Se presente e la push fallisce, manda fallback email. */
  emailCliente?: string | null
}): Promise<{ notified: boolean; pushSent: number; emailSent: boolean }> {
  const oggi = params.oggi ?? new Date()
  const anticipo = params.anticipoGiorni ?? 10
  const pagata = params.pagata ?? false

  if (!isScadenzaImminente(params.dataScadenza, anticipo, pagata, oggi)) {
    return { notified: false, pushSent: 0, emailSent: false }
  }

  const text = buildScadenzaNotificaText(params.titolo, params.dataScadenza, oggi)

  // La campanella (Notification DB) la creiamo UNA SOLA VOLTA: evita duplicati
  // se il cron ritenta giorno dopo giorno. Se l'admin ricarica la stessa
  // scadenza (forceNotifica) la ricreiamo per "riaccendere" il badge.
  //
  // v4.119 (audit) — l'ID della campanella viaggia anche nel DATA della
  // push: il pulsante "Segna come letto" dell'app lo usa per segnare SOLO
  // questa notifica (prima segnava tutta la campanella). Se la campanella
  // esiste già (ritento push), la ritroviamo invece di ricrearla.
  const giaNotificata = await db.scadenza.findUnique({
    where: { id: params.scadenzaId },
    select: { notificata: true },
  })
  let notificaId: string | null = null
  if (!giaNotificata?.notificata || params.forceNotifica) {
    const creata = await db.notification.create({
      data: {
        userId: params.userId,
        type: 'scadenza',
        text,
        detail: params.filePath,
      },
    })
    notificaId = creata.id
  } else {
    notificaId = (
      await db.notification.findFirst({
        where: { userId: params.userId, type: 'scadenza', detail: params.filePath },
        orderBy: { ts: 'desc' },
        select: { id: true },
      })
    )?.id ?? null
  }

  // La push la inviamo SOLO se non e gia stata consegnata con successo.
  // Così, se il cliente era offline / senza subscription / token scaduto, il
  // cron la ritenta il giorno dopo finche non arriva. Nessun cliente perso.
  const stato = await db.scadenza.findUnique({
    where: { id: params.scadenzaId },
    select: { pushInviata: true, emailInviata: true },
  })
  let pushSent = 0
  let consegnataATutti = false
  // v4.62 — SU QUESTA VIA, il giorno stesso della scadenza, il server non
  // manda push, MAI. Il promemoria del giorno X e' la sveglia LOCALE
  // dell'app (8:30, scatta anche a app chiusa: la fa l'orologio di
  // Android). La push del cron arrivava "quando capitava": alle 8 con le
  // sveglie puntuali, nel pieno pomeriggio quando la sveglia di riserva su
  // GitHub parte in ritardo (caso reale 21/9/2026: push alle 14:38) =
  // doppione percepito. Per le scadenze dei giorni FUTURI (giorni >= 1) la
  // push resta come sempre: sono preavvisi, non doppioni.
  //
  // v4.118 — NOTA ONESTA (il commento vecchio diceva "l'app v4.75 deduplica
  // lato telefono": NON e' vero — l'app controlla solo i PROPRI allarmi
  // locali, le push del server non le tocca). La push del giorno stesso
  // esiste da un'altra via: notifyScadenzaDiOggi, chiamata dal ramo
  // dedicato del cron (/api/scadenze/check) SOLO dopo le 08:35 italiane e
  // SOLO se il telefono non ha confermato l'allarme locale. Questa
  // funzione resta senza push il giorno stesso perche' serve alla via
  // immediata (upload / admin imposta la scadenza), non al cron.
  const scadeOggi = giorniMancanti(params.dataScadenza, oggi) === 0
  if (!stato?.pushInviata && !scadeOggi) {
    // v4.58: consegna contata PER CANALE. Prima la push era "consegnata" se la
    // riceveva UN canale qualunque: se l'unico canale attivo era il telefono,
    // il browser del cliente restava fuori PER SEMPRE (la push non viene mai
    // ritentata). Ora la consegna e' vera solo se OGNI canale presente al
    // momento dell'invio ha ricevuto (o era gia' morto e pulito durante
    // l'invio stesso) E almeno un canale ha ricevuto. Se un canale vivo non
    // ha ricevuto per un problema passeggero, il cron della mattina dopo
    // ritenta: nessun cliente perso, nessun ritento a vuoto sui canali sani.
    const contaFcm = () => db.fcmToken.count({ where: { userId: params.userId } })
    const contaWeb = () => db.pushSubscription.count({ where: { userId: params.userId } })
    const [fcmPrima, webPrima] = await Promise.all([contaFcm(), contaWeb()])

    const esito = await sendPushToUserCanali(params.username, {
      title: '⏰ Scadenza imminente',
      body: text,
      url: scadenzaPushUrl(params.filePath),
      tag: 'pfc-scadenza-' + params.scadenzaId,
      data: {
        testo: text,
        tipo: 'scadenza',
        // v4.119 (audit): id della campanella (pulsante "Segna come letto"
        // chirurgico nell'app) e id della scadenza (per la regola unica
        // lato telefono: la sveglia locale si tacita quando arriva la push).
        ...(notificaId ? { id: notificaId } : {}),
        scadenzaId: params.scadenzaId,
      },
    }).catch((e) => {
      console.error('[SCADENZA] push errore:', e)
      return { fcm: 0, web: 0 }
    })
    pushSent = esito.fcm + esito.web

    // Durante l'invio i canali morti vengono ripuliti da soli: ricontiamo.
    // Canale ok = non esisteva, oppure ha ricevuto, oppure e' stato pulito
    // (era morto: non c'era nessuno da avvisare).
    const [fcmDopo, webDopo] = await Promise.all([contaFcm(), contaWeb()])
    const okFcm = fcmPrima === 0 || esito.fcm > 0 || fcmDopo === 0
    const okWeb = webPrima === 0 || esito.web > 0 || webDopo === 0
    consegnataATutti = okFcm && okWeb && pushSent > 0
  } else if (scadeOggi && !stato?.pushInviata) {
    // v4.62: scade OGGI e la push non e' mai stata consegnata: niente push
    // (vedi commento sopra), al posto nostro avvisa la sveglia locale 8:30.
    console.log(
      '[SCADENZA] push del giorno stesso non inviata:',
      params.titolo,
      '- avvisa la sveglia locale delle 8:30'
    )
    // v4.63 - campanella "scade oggi" ANCHE per le scadenze la cui push
    // non e' mai stata consegnata su tutti i canali: prima restavano escluse
    // dalla seconda query del cron (che chiede pushInviata=true) e la loro
    // campanella restava ferma al vecchio testo "scade tra N giorni". La
    // guardia interna a notifyScadenzaOggi (una campanella al giorno per
    // file) rende tutto idempotente anche con piu' sveglie parallele.
    await notifyScadenzaOggi({
      scadenzaId: params.scadenzaId,
      userId: params.userId,
      username: params.username,
      titolo: params.titolo,
      filePath: params.filePath,
      dataScadenza: params.dataScadenza,
      oggi,
    }).catch(() => {})
  }

  // Fallback email: se la push NON e' stata consegnata (nessuna subscription o
  // tutte fallite) e il cliente ha un'email, gli mandiamo una mail di cortesia.
  // Parte AL MASSIMO UNA VOLTA per scadenza (emailInviata), così non spamiamo
  // il giorno dopo se il cron ritenta la push.
  // Email fallback solo negli ultimi 2 giorni prima della scadenza
  const giorniMancanti_ = giorniMancanti(params.dataScadenza, oggi)
  const critico = giorniMancanti_ <= 2

  let emailSent = false
  const emailCliente = params.emailCliente?.trim().toLowerCase() || null
  // v4.63 - MAI nel giorno stesso: da v4.62 il giorno della scadenza il
  // promemoria e' solo la sveglia 8:30 + campanella silenziosa; un'email
  // che partiva la mattina stessa era percepita come secondo promemoria
  // (stesso difetto delle push rimosse da v4.62). L'email di cortesia
  // resta per i giorni di anticipo (ultimi 2), dove copre chi non ha
  // canali push; il flag emailInviata garantisce una sola email in totale.
  if (!scadeOggi && pushSent === 0 && critico && emailCliente && !stato?.emailInviata) {
    emailSent = await sendEmail({
      to: emailCliente,
      subject: 'Promemoria scadenza',
      text:
        `Gentile cliente,\n\n` +
        `Le ricordiamo che risulta in scadenza il documento:\n  ${params.titolo}\n` +
        `${text}\n\n` +
        `Può consultarlo nell'area riservata del portale.\n\n` +
        `Cordiali saluti,\nLo Studio`,
      html:
        `<p>Gentile cliente,</p>` +
        `<p>Le ricordiamo che risulta in scadenza il documento <strong>${params.titolo}</strong>.</p>` +
        `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` +
        `<p>Può consultarlo nell'area riservata del portale.</p>` +
        `<p>Cordiali saluti,<br><strong>Lo Studio</strong></p>`,
    })
  }

  await db.scadenza.update({
    where: { id: params.scadenzaId },
    data: {
      notificata: true,
      // pushInviata = vero SOLO se la consegna e' arrivata su TUTTI i canali
      // presenti (v4.58, vedi commento sopra). Se un canale vivo e' rimasto
      // fuori, resta false e il cron riprovera' nei giorni successivi.
      pushInviata: consegnataATutti ? true : (stato?.pushInviata ?? false),
      emailInviata: emailSent ? true : (stato?.emailInviata ?? false),
    },
  })

  return { notified: true, pushSent, emailSent }
}

/**
 * Promemoria dell'ULTIMO GIORNO ("scade oggi") — SOLO CAMPANELLA (v4.62).
 * Il giorno stesso della scadenza il cliente e' avvisato dalla sveglia
 * locale dell'app (8:30): qui creiamo solo la campanella silenziosa (badge
 * nella campana, zero rumore), cosi' il giorno resta visibile anche dentro
 * l'app. Niente push e niente email: erano loro i doppioni del pomeriggio.
 * Parte anche se la scadenza e' gia' stata notificata nei giorni
 * precedenti, ma AL MASSIMO UNA VOLTA AL GIORNO: la guardia e' la ricerca
 * di una campanella creata OGGI per lo stesso file, cosi' resta unico
 * anche se piu' sveglie (cron Vercel + sveglia di riserva) buscano insieme.
 */
export async function notifyScadenzaOggi(params: {
  scadenzaId: string
  userId: string
  username: string
  titolo: string
  filePath: string
  dataScadenza: Date
  oggi?: Date
}): Promise<{ notified: boolean; pushSent: number; emailSent: boolean }> {
  const oggi = params.oggi ?? new Date()
  const inizioGiornata = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate())
  const text = buildScadenzaNotificaText(params.titolo, params.dataScadenza, oggi)

  // Guardia anti-doppione: una campanella per questo file esiste GIA' creata
  // oggi? (copre sia il promemoria normale sia un eventuale "oggi" gemello)
  // v4.118 — la guardia guarda ENTRAMBI i tipi ('scadenza' e 'scadenza_oggi'):
  // prima vedeva solo 'scadenza' e, se la push di mattina presto aveva gia'
  // creato la sua campanella 'scadenza_oggi', questa funzione ne aggiungeva
  // una seconda per lo stesso documento.
  const giaOggi = await db.notification.findFirst({
    where: {
      userId: params.userId,
      detail: params.filePath,
      ts: { gte: inizioGiornata },
      OR: [{ type: 'scadenza_oggi' }, { type: 'scadenza_oggi_pending' }, { type: 'scadenza' }],
    },
  })
  if (giaOggi) return { notified: false, pushSent: 0, emailSent: false }

  await db.notification.create({
    data: {
      userId: params.userId,
      type: 'scadenza',
      text,
      detail: params.filePath,
    },
  })

  // v4.62 — Qui finisce il lavoro del server il giorno stesso: solo la
  // campanella qui sopra. La push "Scadenza OGGI" e l'email di fallback
  // che stavano qui sono state TOLTE: la push raddoppiava la sveglia 8:30
  // dell'app (a volte con ore di ritardo, quando la sveglia di riserva su
  // GitHub arrivava nel pomeriggio) e l'email sembrava un secondo
  // promemoria. I clienti senza app sono gia' coperti dal primo avviso:
  // push di anticipo nei giorni prima + email di fallback entro i 2 giorni
  // finali. Il ritorno resta compatibile: pushSent 0, emailSent false.
  return { notified: true, pushSent: 0, emailSent: false }
}

/**
 * PUSH DEDICATA "Scade OGGI" per il GIORNO della scadenza (v4.75b, rifatta
 * v4.118). Prima (v4.62-4.63) il server qui taceva del tutto e tutto
 * dipendeva dall'allarme locale delle 08:30 del telefono, che Android
 * puo' perdere in risparmio batteria: e' il caso reale del 24/9/2026
 * ("Scade OGGI" mai arrivato nonostante il preavviso del giorno prima).
 *
 * v4.118 — QUANDO parte (deciso dal ramo del giorno stesso in
 * /api/scadenze/check, che e' l'unico chiamante):
 *   1. finestra aperta: dopo le 08:35 ora italiana (la sveglia locale
 *      delle 08:30 ha avuto il suo spazio);
 *   2. il telefono NON ha confermato l'allarme locale (allarme_locale_il
 *      di oggi): se l'utente ha avuto la sveglia, la push tace;
 *   3. la push non e' gia' stata consegnata oggi (guardia qui sotto).
 * NON serve piu' che il preavviso sia stato consegnato (il vecchio
 * requisito notificata && pushInviata del cron e' stato tolto: chi non
 * aveva ricevuto il preavviso non riceveva NIENTE il giorno stesso).
 *
 * DUE GUARDIE SEPARATE (prima una sola, e morsicava la push: la campanella
 * silenziosa creata la mattina bloccava anche la push successiva):
 *  - guardia PUSH: esiste la campanella 'scadenza_oggi' di oggi? Viene
 *    scritta solo alla CHIUSURA della push, quindi e' il segno "la push di
 *    oggi e' gia' partita" e la chance successiva tace. La campanella
 *    'scadenza' del mattino da sola NON conta (non blocca la push).
 *  - UNA campanella sola per file e giorno: la dedupe finale tiene la piu'
 *    recente (zero rumore in campana).
 *
 * v4.78c — PRESA ATOMICA DELLO SLOT (chiude la race tra chance sovrapposte).
 * Prima il segno si scriveva DOPO la push: due giri sovrapposti leggevano
 * entrambi "segno assente" e sparavano entrambi. Ora lo slot si prende PRIMA
 * con updateMany condizionato sul type attuale: la campanella 'scadenza' del
 * mattino diventa 'scadenza_oggi_pending' SOLO nel giro che vince (chi
 * arriva secondo trova il type gia' cambiato, count=0, tace). Stati:
 *   'scadenza' (campanella mattino) -> 'scadenza_oggi_pending' (slot preso,
 *   push in volo, lease 10 min) -> 'scadenza_oggi' (push accettata).
 * Se la push NON parte, il pending torna 'scadenza': la chance dopo ritenta
 * (rete di sicurezza intatta). Se un giro muore a meta' (pending stale), la
 * chance dopo lo riprende e ripusha: MAI il silenzio, al peggio un doppione
 * (principio v4.118). Il doppio create a vuoto resta l'unico buco residuo:
 * richiede cron del mattino morto E chance sovrapposte, e il tag FCM
 * identico fa sostituire la seconda notifica alla prima nel vassoio.
 *
 * Niente email il giorno stesso (principio v4.63 confermato): questa
 * funzione non tocca l'email. Tag FCM dedicato pfc-scadenza-oggi-<id>,
 * distinto dal preavviso: i due avvisi non si sovrascrivono mai.
 */
export async function notifyScadenzaDiOggi(params: {
  scadenzaId: string
  userId: string
  username: string
  titolo: string
  filePath: string
  dataScadenza: Date
  oggi?: Date
}): Promise<{ pushSent: number }> {
  const oggi = params.oggi ?? new Date()
  const inizioGiornata = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate())

  // v4.118 — GUARDIA PUSH (separata dalla campanella): la campanella
  // 'scadenza_oggi' nasce solo alla CHIUSURA di una push accettata, quindi
  // e' lei il segno "push di oggi gia' partita". La campanella 'scadenza'
  // creata dalla finestra del mattino non deve bloccare la push.
  const giaPushOggi = await db.notification.findFirst({
    where: {
      userId: params.userId,
      type: 'scadenza_oggi',
      detail: params.filePath,
      ts: { gte: inizioGiornata },
    },
  })
  if (giaPushOggi) return { pushSent: 0 }

  const dataIt = params.dataScadenza.toLocaleDateString('it-IT')
  const text = `${params.titolo}: scade OGGI (${dataIt})`

  // v4.78c — PRESA ATOMICA DELLO SLOT (prima della push, non dopo). Un solo
  // updateMany condizionato sul type attuale: tra giri concorrenti count=1
  // per UNO solo, gli altri trovano il type gia' cambiato e tacciono.
  const adesso = new Date()
  const presa = await db.notification.updateMany({
    where: {
      userId: params.userId,
      detail: params.filePath,
      ts: { gte: inizioGiornata },
      type: 'scadenza',
    },
    data: { type: 'scadenza_oggi_pending', text, ts: adesso },
  })

  if (presa.count === 0) {
    // Nessuna campanella del mattino da promuovere: o non esiste (cron del
    // mattino morto), o un giro concorrente ha GIA' preso lo slot (la sua
    // campanella ora e' 'scadenza_oggi_pending').
    const pendente = await db.notification.findFirst({
      where: {
        userId: params.userId,
        detail: params.filePath,
        ts: { gte: inizioGiornata },
        type: 'scadenza_oggi_pending',
      },
      orderBy: { ts: 'desc' },
    })
    if (pendente) {
      const fresco =
        adesso.getTime() - pendente.ts.getTime() < LEASE_PUSH_OGGI_MINUTI * 60 * 1000
      if (fresco) {
        // Un altro giro sta pushando ORA: tacciamo.
        return { pushSent: 0 }
      }
      // Pending STALE: il giro che l'aveva preso e' morto prima di chiudere
      // (crash tra presa e chiusura). Riprendiamo lo slot con update
      // ATOMICO: il where richiede che il lease sia ANCORA scaduto, cosi'
      // tra due giri che lo riprendono insieme count=1 per UNO solo (chi
      // arriva secondo trova il ts gia' rinnovato e tace).
      const sogliaStale = new Date(adesso.getTime() - LEASE_PUSH_OGGI_MINUTI * 60 * 1000)
      const ripresa = await db.notification.updateMany({
        where: {
          userId: params.userId,
          detail: params.filePath,
          type: 'scadenza_oggi_pending',
          ts: { gte: inizioGiornata, lt: sogliaStale },
        },
        data: { ts: adesso },
      })
      if (ripresa.count === 0) return { pushSent: 0 }
    } else {
      // Cron del mattino morto: creiamo noi il pending. Due giri
      // concorrenti possono crearlo insieme (l'unica corsa non atomicabile
      // senza vincolo UNIQUE sul DB): succede SOLO se manca la campanella del
      // mattino E le chance si sovrappongono, e il tag FCM identico fa
      // sostituire la seconda notifica alla prima nel vassoio Android.
      await db.notification.create({
        data: {
          userId: params.userId,
          type: 'scadenza_oggi_pending',
          text,
          detail: params.filePath,
        },
      })
    }
  }

  // v4.119 (audit) — ID della campanella per il data della push. Nello slot
  // v4.78c il pending È la campanella finale: alla chiusura diventa
  // 'scadenza_oggi' restando la STESSA riga, quindi il suo id è stabile e
  // il pulsante "Segna come letto" dell'app segna la notifica giusta.
  const pendingId = (
    await db.notification.findFirst({
      where: {
        userId: params.userId,
        detail: params.filePath,
        ts: { gte: inizioGiornata },
        type: 'scadenza_oggi_pending',
      },
      orderBy: { ts: 'desc' },
      select: { id: true },
    })
  )?.id ?? null

  const esito = await sendPushToUserCanali(params.username, {
    title: '⏰ Scade OGGI',
    body: `"${params.titolo}" scade OGGI (${dataIt}). Aprilo dall'archivio.`,
    url: scadenzaPushUrl(params.filePath),
    tag: 'pfc-scadenza-oggi-' + params.scadenzaId,
    data: {
      testo: text,
      tipo: 'scadenza_oggi',
      // v4.119 (audit): id campanella (pulsante chirurgico) + scadenzaId
      // (regola unica lato telefono: la sveglia locale delle 08:30 si
      // tacita quando questa push arriva a app aperta).
      ...(pendingId ? { id: pendingId } : {}),
      scadenzaId: params.scadenzaId,
    },
  }).catch((e) => {
    console.error('[SCADENZA-OGGI] push errore:', e)
    return { fcm: 0, web: 0 }
  })
  const pushSent = esito.fcm + esito.web

  // v4.78c — CHIUSURA o RILASCIO dello slot.
  if (pushSent > 0) {
    // CHIUSURA: tutti i pending del giorno diventano il segno finale
    // 'scadenza_oggi' = "push di oggi accettata". La chance dopo tace.
    await db.notification.updateMany({
      where: {
        userId: params.userId,
        detail: params.filePath,
        ts: { gte: inizioGiornata },
        type: 'scadenza_oggi_pending',
      },
      data: { type: 'scadenza_oggi' },
    })
    // UNA campanella sola per file e giorno (v4.78b): se sono sopravvissuti
    // gemelli (forceNotifica admin / doppio create), teniamo la piu' recente
    // e ripuliamo le altre. Nota: si puo' arrivare qui con piu' segni anche
    // senza gemelli (una push + una creata tra presa e chiusura).
    const segni = await db.notification.findMany({
      where: {
        userId: params.userId,
        detail: params.filePath,
        ts: { gte: inizioGiornata },
        type: 'scadenza_oggi',
      },
      orderBy: { ts: 'desc' },
    })
    if (segni.length > 1) {
      await db.notification
        .deleteMany({ where: { id: { in: segni.slice(1).map((n) => n.id) } } })
        .catch(() => {})
    }
  } else {
    // RILASCIO: la push non e' stata accettata da nessun canale. Il pending
    // torna campanella del mattino ('scadenza', testo standard): la chance
    // dopo ritenta, la rete di sicurezza v4.75 resta intatta.
    await db.notification.updateMany({
      where: {
        userId: params.userId,
        detail: params.filePath,
        ts: { gte: inizioGiornata },
        type: 'scadenza_oggi_pending',
      },
      data: {
        type: 'scadenza',
        text: buildScadenzaNotificaText(params.titolo, params.dataScadenza, oggi),
      },
    })
  }

  return { pushSent }
}
