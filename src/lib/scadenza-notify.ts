/**
 * Notifiche promemoria scadenze: campanella in-app + Web Push (anche a client
 * non loggato, gestita dal Service Worker). Usato da upload, gestione clienti
 * e cron giornaliero.
 */
import { db } from './db'
import { sendPushToUser } from './push'

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
}): Promise<{ notified: boolean; pushSent: number }> {
  const oggi = params.oggi ?? new Date()
  const anticipo = params.anticipoGiorni ?? 10
  const pagata = params.pagata ?? false

  if (!isScadenzaImminente(params.dataScadenza, anticipo, pagata, oggi)) {
    return { notified: false, pushSent: 0 }
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
    select: { pushInviata: true },
  })
  let pushSent = 0
  if (!stato?.pushInviata) {
    pushSent = await sendPushToUser(params.username, {
      title: '⏰ Scadenza imminente',
      body: text,
      url: scadenzaPushUrl(params.filePath),
      tag: 'pfc-scadenza-' + params.scadenzaId,
      data: { testo: text, tipo: 'scadenza' },
    }).catch((e) => {
      console.error('[SCADENZA] push errore:', e)
      return 0
    })
  }

  await db.scadenza.update({
    where: { id: params.scadenzaId },
    data: {
      notificata: true,
      // pushInviata = vero SOLO se abbiamo davvero recapitato ad almeno una
      // subscription. Se non ci sono subscription o tutte falliscono, resta
      // false e il cron riprovera nei giorni successivi.
      pushInviata: pushSent > 0 ? true : (stato?.pushInviata ?? false),
    },
  })

  return { notified: true, pushSent }
}
