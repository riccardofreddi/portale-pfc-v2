/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Test della macchina a stati "Scade OGGI" (notifyScadenzaDiOggi) — v4.78c.
 *
 * Stati della campanella per un file nel giorno di scadenza:
 *   'scadenza' (mattino) -> 'scadenza_oggi_pending' (slot preso, lease 10')
 *   -> 'scadenza_oggi' (push accettata) | -> 'scadenza' (rilascio, retry).
 *
 * Il DB e' un mock in memoria con semantica Prisma reale (where/type/ts/OR/
 * orderBy): i test asseriscono sullo STATO delle righe e sul numero di push.
 */
import { notifyScadenzaDiOggi, notifyScadenzaOggi, LEASE_PUSH_OGGI_MINUTI } from '../src/lib/scadenza-notify'
import { sendPushToUserCanali } from '../src/lib/push'
import { resetNotifiche, aggiungiNotifica, elenco } from './mocks/db'

jest.mock('../src/lib/push', () => require('./mocks/push'))
jest.mock('../src/lib/email', () => require('./mocks/email'))

const GIORNO = '2026-10-26'
const params = {
  scadenzaId: 's1',
  userId: 'u1',
  username: 'cliente1',
  titolo: 'Attestazione',
  filePath: 'Documenti/cliente1/2026/Contratti/attestazione.pdf',
  dataScadenza: new Date(GIORNO + 'T00:00:00Z'),
}

const ore = (h: number, m: number) => new Date(`${GIORNO}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`)

function campanellaMattino() {
  return aggiungiNotifica({
    userId: params.userId,
    type: 'scadenza',
    text: 'Attestazione: scade oggi (26/10/2026)',
    detail: params.filePath,
    ts: ore(7, 0), // cron Vercel 06:00 UTC, fuori finestra
  })
}

beforeEach(() => {
  resetNotifiche()
  ;(sendPushToUserCanali as jest.Mock).mockReset()
  jest.useFakeTimers().setSystemTime(ore(8, 45)) // dentro la finestra
})

afterEach(() => {
  jest.useRealTimers()
})

describe('notifyScadenzaDiOggi — il doppione 08:45 + 09:30 (bug v4.78b)', () => {
  test('campanella del mattino + push ok alle 08:45 -> alle 09:30 ZERO push', async () => {
    campanellaMattino()
    ;(sendPushToUserCanali as jest.Mock).mockResolvedValue({ fcm: 1, web: 0 })

    const prima = await notifyScadenzaDiOggi(params)
    expect(prima.pushSent).toBe(1)
    expect(elenco().filter((n) => n.type === 'scadenza_oggi')).toHaveLength(1)
    expect(elenco()[0].text).toContain('scade OGGI')

    // Chance delle 09:30 (08:30 UTC): deve tacere.
    jest.setSystemTime(ore(9, 30))
    const dopo = await notifyScadenzaDiOggi(params)
    expect(dopo.pushSent).toBe(0)
    expect(sendPushToUserCanali).toHaveBeenCalledTimes(1) // UNA sola push
    expect(elenco()).toHaveLength(1) // UNA sola campanella
  })

  test('push rifiutata alle 08:45 -> rilascio a scadenza -> ritento alle 09:30 va a segno', async () => {
    campanellaMattino()
    ;(sendPushToUserCanali as jest.Mock)
      .mockResolvedValueOnce({ fcm: 0, web: 0 }) // 08:45: cliente offline
      .mockResolvedValueOnce({ fcm: 1, web: 0 }) // 09:30: ritento ok

    const prima = await notifyScadenzaDiOggi(params)
    expect(prima.pushSent).toBe(0)
    // Rilascio: la campanella torna 'scadenza' col testo standard (non pending!)
    expect(elenco()).toHaveLength(1)
    expect(elenco()[0].type).toBe('scadenza')
    expect(elenco()[0].text).toBe('Attestazione: scade oggi (26/10/2026)')

    jest.setSystemTime(ore(9, 30))
    const dopo = await notifyScadenzaDiOggi(params)
    expect(dopo.pushSent).toBe(1)
    expect(sendPushToUserCanali).toHaveBeenCalledTimes(2) // rete di sicurezza: 2 tentativi
    expect(elenco()[0].type).toBe('scadenza_oggi')
  })
})

describe('notifyScadenzaDiOggi — cron del mattino morto (nessuna campanella)', () => {
  test('crea il pending, pusha, chiude; il giro dopo tace', async () => {
    ;(sendPushToUserCanali as jest.Mock).mockResolvedValue({ fcm: 0, web: 1 })

    const prima = await notifyScadenzaDiOggi(params)
    expect(prima.pushSent).toBe(1)
    expect(elenco()).toHaveLength(1)
    expect(elenco()[0].type).toBe('scadenza_oggi')

    jest.setSystemTime(ore(9, 30))
    const dopo = await notifyScadenzaDiOggi(params)
    expect(dopo.pushSent).toBe(0)
    expect(sendPushToUserCanali).toHaveBeenCalledTimes(1)
    expect(elenco()).toHaveLength(1)
  })
})

describe('notifyScadenzaDiOggi — lease dello slot (v4.78c)', () => {
  test('pending fresco (altro giro in volo) -> tace, zero push', async () => {
    aggiungiNotifica({
      userId: params.userId,
      type: 'scadenza_oggi_pending',
      text: 'x',
      detail: params.filePath,
      ts: new Date(Date.now() - 3 * 60 * 1000), // preso 3 min fa < lease 10
    })

    const esito = await notifyScadenzaDiOggi(params)
    expect(esito.pushSent).toBe(0)
    expect(sendPushToUserCanali).not.toHaveBeenCalled()
  })

  test('pending stale (giro morto nel crash) -> ripreso, push, chiusura', async () => {
    aggiungiNotifica({
      userId: params.userId,
      type: 'scadenza_oggi_pending',
      text: 'vecchio',
      detail: params.filePath,
      ts: new Date(Date.now() - (LEASE_PUSH_OGGI_MINUTI + 5) * 60 * 1000), // 15 min fa
    })
    ;(sendPushToUserCanali as jest.Mock).mockResolvedValue({ fcm: 1, web: 0 })

    const esito = await notifyScadenzaDiOggi(params)
    expect(esito.pushSent).toBe(1)
    expect(elenco()).toHaveLength(1)
    expect(elenco()[0].type).toBe('scadenza_oggi')
  })

  test('ripresa contesa: due giri riprendono lo stesso stale, UNO solo pusha', async () => {
    aggiungiNotifica({
      userId: params.userId,
      type: 'scadenza_oggi_pending',
      text: 'vecchio',
      detail: params.filePath,
      ts: new Date(Date.now() - (LEASE_PUSH_OGGI_MINUTI + 5) * 60 * 1000),
    })
    ;(sendPushToUserCanali as jest.Mock).mockResolvedValue({ fcm: 1, web: 0 })

    // I due giri partono quasi insieme (stesso istante di sistema).
    const [a, b] = await Promise.all([notifyScadenzaDiOggi(params), notifyScadenzaDiOggi(params)])
    const pushTotali = a.pushSent + b.pushSent
    // Con il where atomico ts < soglia, uno dei due prende il lease rinnovato
    // prima che l'altro filtri: al massimo UNO pusha. (Se entrambi girano nello
    // stesso tick il mock li serializza: il primo rinnova, il secondo vede fresco.)
    expect(pushTotali).toBeLessThanOrEqual(1)
    expect(elenco().filter((n) => n.type === 'scadenza_oggi')).toHaveLength(1)
  })

  test('campanella del mattino contesa: due giri insieme, UNA sola push', async () => {
    campanellaMattino()
    ;(sendPushToUserCanali as jest.Mock).mockResolvedValue({ fcm: 1, web: 0 })

    const [a, b] = await Promise.all([notifyScadenzaDiOggi(params), notifyScadenzaDiOggi(params)])
    expect(a.pushSent + b.pushSent).toBe(1) // la presa atomica vince una volta
    expect(elenco()).toHaveLength(1)
    expect(elenco()[0].type).toBe('scadenza_oggi')
  })
})

describe('notifyScadenzaDiOggi — gemelli e consegna parziale', () => {
  test('due campanelle gemelle (forceNotifica admin) -> una push, dedupe a una', async () => {
    campanellaMattino()
    campanellaMattino()
    ;(sendPushToUserCanali as jest.Mock).mockResolvedValue({ fcm: 1, web: 0 })

    const esito = await notifyScadenzaDiOggi(params)
    expect(esito.pushSent).toBe(1)
    expect(sendPushToUserCanali).toHaveBeenCalledTimes(1)
    expect(elenco()).toHaveLength(1) // la dedupe tiene la piu' recente
    expect(elenco()[0].type).toBe('scadenza_oggi')
  })

  test('consegna parziale (fcm ok, web ko) -> segno scritto, giorno chiuso', async () => {
    // Semantica VOLUTA (v4.118): basta un canale accettato a chiudere la
    // giornata; il canale fallito non viene ritentato. Il test lo inchioda.
    campanellaMattino()
    ;(sendPushToUserCanali as jest.Mock).mockResolvedValue({ fcm: 1, web: 0 })

    await notifyScadenzaDiOggi(params)
    expect(elenco()[0].type).toBe('scadenza_oggi')

    jest.setSystemTime(ore(9, 30))
    await notifyScadenzaDiOggi(params)
    expect(sendPushToUserCanali).toHaveBeenCalledTimes(1)
  })
})

describe('notifyScadenzaOggi — guardia campanella (incluso pending v4.78c)', () => {
  test('con push in volo (pending) NON crea una seconda campanella', async () => {
    aggiungiNotifica({
      userId: params.userId,
      type: 'scadenza_oggi_pending',
      text: 'x',
      detail: params.filePath,
      ts: new Date(Date.now() - 60 * 1000),
    })

    const esito = await notifyScadenzaOggi({ ...params })
    expect(esito.notified).toBe(false)
    expect(elenco()).toHaveLength(1) // niente gemella
  })

  test('senza campanelle crea quella del mattino', async () => {
    const esito = await notifyScadenzaOggi({ ...params })
    expect(esito.notified).toBe(true)
    expect(elenco()).toHaveLength(1)
    expect(elenco()[0].type).toBe('scadenza')
    expect(elenco()[0].text).toBe('Attestazione: scade oggi (26/10/2026)')
  })

  test('con la campanella gia\u0300 scritta (scadenza_oggi) resta a zero', async () => {
    aggiungiNotifica({
      userId: params.userId,
      type: 'scadenza_oggi',
      text: 'Attestazione: scade OGGI (26/10/2026)',
      detail: params.filePath,
      ts: ore(8, 45),
    })

    const esito = await notifyScadenzaOggi({ ...params })
    expect(esito.notified).toBe(false)
    expect(elenco()).toHaveLength(1)
  })
})
