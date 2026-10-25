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
  const giaNotificata = await db.scadenza.findUnique({
    where: { id: params.scadenzaId },
    select: { notificata: true },
  })
  if (!giaNotificata?.notificata || params.forceNotifica) {
    await db.notification.create({
      data: {
        userId: params.userId,
        type: 'scadenza',
        text,
        detail: params.filePath,
      },
    })
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
      data: { testo: text, tipo: 'scadenza' },
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
      OR: [{ type: 'scadenza_oggi' }, { type: 'scadenza' }],
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
 *    scritta SEMPRE dopo una push consegnata (v4.78b: se c'e' gia' la
 *    campanella 'scadenza' del mattino viene PROMOSSA a 'scadenza_oggi',
 *    altrimenti si crea), quindi e' il segno "la push di oggi e' gia'
 *    partita" e la chance successiva tace. La campanella 'scadenza' del
 *    mattino da sola NON conta (non blocca la push): e' il segno scritto
 *    DOPO la push a contare.
 *  - UNA campanella sola per file e giorno: la promozione aggiorna quella
 *    esistente invece di aggiungerne una seconda (zero rumore in campana).
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
  // 'scadenza_oggi' nasce solo dopo una push consegnata, quindi e' lei il
  // segno "push di oggi gia' partita". La campanella 'scadenza' creata
  // dalla finestra del mattino non deve bloccare la push.
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

  const esito = await sendPushToUserCanali(params.username, {
    title: '⏰ Scade OGGI',
    body: `"${params.titolo}" scade OGGI (${dataIt}). Aprilo dall'archivio.`,
    url: scadenzaPushUrl(params.filePath),
    tag: 'pfc-scadenza-oggi-' + params.scadenzaId,
    data: { testo: text, tipo: 'scadenza_oggi' },
  }).catch((e) => {
    console.error('[SCADENZA-OGGI] push errore:', e)
    return { fcm: 0, web: 0 }
  })
  const pushSent = esito.fcm + esito.web

  // v4.78b — IL SEGNO DELLA PUSH VA SCRITTO SEMPRE (fix del doppione tra le
  // due chance). La campanella e' il segno "push di oggi consegnata": senza
  // questo segno, la chance dopo (09:30 it) sparava la push di nuovo.
  // Nel vecchio "if (!giaCampanella)" il segno NON veniva mai scritto quando
  // la campanella del mattino esisteva gia' (il cron Vercel delle 07:00 it,
  // fuori finestra, la crea sempre): doppione garantito alle 08:45 E 09:30
  // per ogni cliente che non aprirebbe l'app il giorno della scadenza.
  // Ora: se esiste la campanella del mattino la PROMUOVO (type aggiornato,
  // testo "scade OGGI") — una voce sola in campana e il giro dopo tace.
  if (pushSent > 0) {
    const giaCampanella = await db.notification.findFirst({
      where: {
        userId: params.userId,
        detail: params.filePath,
        ts: { gte: inizioGiornata },
        OR: [{ type: 'scadenza_oggi' }, { type: 'scadenza' }],
      },
    })
    if (giaCampanella?.type === 'scadenza_oggi') {
      // Segno gia' presente: niente da scrivere (non succede con la guardia
      // in cima, resta difensivo per un giro concorrente).
    } else if (giaCampanella) {
      await db.notification.update({
        where: { id: giaCampanella.id },
        data: { type: 'scadenza_oggi', text },
      })
    } else {
      await db.notification.create({
        data: {
          userId: params.userId,
          type: 'scadenza_oggi',
          text,
          detail: params.filePath,
        },
      })
    }
  }

  return { pushSent }
}
