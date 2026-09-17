/**
 * Notifiche promemoria scadenze: campanella in-app + Web Push (anche a client
 * non loggato, gestita dal Service Worker). Usato da upload, gestione clienti
 * e cron giornaliero.
 */
import { db } from './db'
import { sendPushToUser, sendPushToUserCanali } from './push'
import { sendEmail } from './email'

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

/** URL deep-link per aprire l'archivio sulla cartella del documento in scadenza. */
export function scadenzaPushUrl(filePath: string): string {
  const parts = filePath.split('/')
  const anno = parts[2]
  const cartella = parts[3]
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
  if (!stato?.pushInviata) {
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
  if (pushSent === 0 && critico && emailCliente && !stato?.emailInviata) {
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
 * Promemoria dell'ULTIMO GIORNO ("scade oggi"). Diverso dal primo avviso:
 * parte anche se la scadenza e' gia' stata notificata nei giorni precedenti,
 * ma AL MASSIMO UNA VOLTA AL GIORNO. La guardia e' la ricerca di una
 * campanella creata OGGI per lo stesso file: cosi' il promemoria resta unico
 * anche se piu' sveglie (cron Vercel + sveglia di riserva) buscano insieme.
 */
export async function notifyScadenzaOggi(params: {
  scadenzaId: string
  userId: string
  username: string
  titolo: string
  filePath: string
  dataScadenza: Date
  /** Email del cliente per il fallback (al massimo una volta per scadenza). */
  emailCliente?: string | null
  /** true se l'email di fallback era gia' stata mandata in passato. */
  emailGiaInviata?: boolean
  oggi?: Date
}): Promise<{ notified: boolean; pushSent: number; emailSent: boolean }> {
  const oggi = params.oggi ?? new Date()
  const inizioGiornata = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate())
  const text = buildScadenzaNotificaText(params.titolo, params.dataScadenza, oggi)

  // Guardia anti-doppione: una campanella per questo file esiste GIA' creata
  // oggi? (copre sia il promemoria normale sia un eventuale "oggi" gemello)
  const giaOggi = await db.notification.findFirst({
    where: {
      userId: params.userId,
      type: 'scadenza',
      detail: params.filePath,
      ts: { gte: inizioGiornata },
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

  // Push dedicata all'ultimo giorno: titolo evidente e tag separato, cosi'
  // non sostituisce (né viene sostituito dal) l'avviso dei giorni scorsi.
  const pushSent = await sendPushToUser(params.username, {
    title: '🚨 Scadenza OGGI',
    body: text,
    url: scadenzaPushUrl(params.filePath),
    tag: 'pfc-scadenza-' + params.scadenzaId + '-oggi',
    data: { testo: text, tipo: 'scadenza' },
  }).catch((e) => {
    console.error('[SCADENZA OGGI] push errore:', e)
    return 0
  })

  // Fallback email: solo se la push non ha raggiunto nessun canale e non era
  // gia' stata mandata una email per questa scadenza (mai piu' di una).
  let emailSent = false
  const emailCliente = params.emailCliente?.trim().toLowerCase() || null
  if (pushSent === 0 && emailCliente && !params.emailGiaInviata) {
    emailSent = await sendEmail({
      to: emailCliente,
      subject: 'Promemoria: scadenza OGGI',
      text:
        `Gentile cliente,\n\n` +
        `Le ricordiamo che il documento risulta in scadenza OGGI:\n  ${params.titolo}\n` +
        `${text}\n\n` +
        `Può consultarlo nell'area riservata del portale.\n\n` +
        `Cordiali saluti,\nLo Studio`,
      html:
        `<p>Gentile cliente,</p>` +
        `<p>Le ricordiamo che il documento <strong>${params.titolo}</strong> risulta in scadenza <strong>OGGI</strong>.</p>` +
        `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` +
        `<p>Può consultarlo nell'area riservata del portale.</p>` +
        `<p>Cordiali saluti,<br><strong>Lo Studio</strong></p>`,
    })
  }

  return { notified: true, pushSent, emailSent }
}
