/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * v4.95 — REGISTRO SVEGLIE: la storia completa del piano avvisi, una voce
 * per OGNI sveglia (giorni di piano 10/3/1/anticipo + giorno stesso).
 *
 * Risponde alla domanda reale dell'utente: "perche' non ci sono tutte le
 * scadenze notificate? quelle del 10-3-1 + oggi". Prima il giro scriveva
 * SOLO notificata (una volta per scadenza) e il registro di giro era una
 * riga riscritta: nessuna vista mostrava le 4 sveglie. Ora il giro scrive
 * in system_settings (chiave sveglie_scadenze, crescita zero, prune a 21
 * giorni) una voce per sveglia con la data e i fatti del SERVER, piu' la
 * prova campanella letta (notifications.read=true = "Vista in app").
 *
 * Due livelli di test:
 *  - funzioni pure (leggi/pulisci/unisci/testi esito): la forma del registro;
 *  - integrazione col GIRO VERO (eseguiCheckScadenze, mock db come
 *    scadenze-check.test.ts): il giro del giorno di piano scrive la voce
 *    "3 giorni prima", quello del giorno stesso la voce "giorno stesso",
 *    la campanella aperta dal cliente entra come letta.
 */
import { eseguiCheckScadenze } from '../src/lib/scadenze-check'
import {
  leggiRegistro,
  pulisciRegistro,
  unisciVoci,
  testoEsitoPreavviso,
  testoEsitoOggi,
  CHIAVE_SVEGLIE,
  GIORNI_CONSERVAZIONE,
  type RegistroSveglie,
} from '../src/lib/sveglie-registro'
import { db, resetNotifiche, aggiungiNotifica } from './mocks/db'
import { sendPushToUserCanali } from './mocks/push'

jest.mock('../src/lib/push', () => require('./mocks/push'))
jest.mock('../src/lib/email', () => require('./mocks/email'))

const FP = 'Documenti/2026/Contratti/glifato.pdf'

// Il giro gira il 26/10/2026 ore 10:30 italiane (= 09:30 UTC: dopo il cambio
// ora solare del 25/10 l'Italia e' UTC+1, come nelle suite del check).
const ADESSO = new Date('2026-10-26T09:30:00Z')

const scadenzaDiPiano = {
  id: 's1',
  filePath: FP,
  userId: 'u1',
  titolo: 'Certificato P.IVA Glifato',
  dataScadenza: new Date('2026-10-29T00:00:00Z'), // 3 giorni dopo: piano [3,1]
  anticipoGiorni: 3,
  notificata: false,
  pushInviata: false,
  emailInviata: false,
  pagata: false,
  allarmeLocaleIl: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  user: { username: 'glifato', name: 'Glifato', email: 'glifato@test.it' },
}

const scadenzaDiOggi = {
  ...scadenzaDiPiano,
  id: 's2',
  dataScadenza: new Date('2026-10-26T00:00:00Z'), // oggi: g=0
}

function upsertSveglie(): string | undefined {
  const chiamate = (db.systemSetting.upsert as jest.Mock).mock.calls.map((c) => c[0])
  const trovata = chiamate.find((u) => u.where?.key === CHIAVE_SVEGLIE)
  return trovata?.update?.value as string | undefined
}

function righeGiroEScadenzaPrune(svedGiro: unknown[], righe: unknown[]) {
  ;(db.scadenza.findMany as jest.Mock).mockImplementation(async ({ where }: any) => {
    if (where?.filePath?.in) return righe // query di prune del registro
    return svedGiro // query del giro (scadenze da controllare)
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  resetNotifiche()
  ;(db.systemSetting.findUnique as jest.Mock).mockResolvedValue(null)
  ;(db.scadenza.findUnique as jest.Mock).mockResolvedValue({
    notificata: false,
    pushInviata: false,
    emailInviata: false,
  })
  ;(db.fcmToken.findFirst as jest.Mock).mockResolvedValue({
    updatedAt: new Date('2026-10-20T00:00:00Z'), // app aperta DOPO la creazione: sveglia armata
  })
  ;(sendPushToUserCanali as jest.Mock).mockResolvedValue({ fcm: 1, web: 0 })
})

afterEach(() => {
  jest.useRealTimers()
})

describe('funzioni pure — la forma del registro', () => {
  test('leggiRegistro: assente/corrotto = registro vuoto (il giro lo riscrive pulito)', () => {
    expect(leggiRegistro(null)).toEqual({})
    expect(leggiRegistro(undefined)).toEqual({})
    expect(leggiRegistro('')).toEqual({})
    expect(leggiRegistro('non-json')).toEqual({})
    expect(leggiRegistro('[1,2,3]')).toEqual({})
    const reg = leggiRegistro(
      JSON.stringify({ [FP]: { t: 'Glifato', sc: '2026-10-29T00:00:00Z', ant: 3, letta: false, voci: { '3': { il: '2026-10-26T09:30:00Z', esito: 'campanella avvisi creata in app' } } } }),
    )
    expect(Object.keys(reg)).toEqual([FP])
    expect(reg[FP].voci['3'].esito).toContain('campanella avvisi creata in app')
  })

  test('leggiRegistro: le voci malformate escono, quelle buone restano', () => {
    const raw = JSON.stringify({
      [FP]: { t: 'Glifato', sc: '2026-10-29T00:00:00Z', ant: 3, letta: true, voci: {} },
      brutta: { t: 123 },
      ancheBrutta: 'stringa',
    })
    const reg = leggiRegistro(raw)
    expect(Object.keys(reg)).toEqual([FP])
    expect(reg[FP].letta).toBe(true)
  })

  test('testoEsitoPreavviso: solo fatti del server, per ogni stato push', () => {
    const creata = testoEsitoPreavviso({ campanellaCreata: true, push: 'none', giorni: 3, emailInviata: false })
    expect(creata).toBe('campanella avvisi creata in app')
    const gia = testoEsitoPreavviso({ campanellaCreata: false, push: 'none', giorni: 3, emailInviata: false })
    expect(gia).toBe('campanella avvisi già in app')
    expect(testoEsitoPreavviso({ campanellaCreata: true, push: 'consegnata', giorni: 3, emailInviata: false })).toContain('push di rete "Scade tra 3 giorni" consegnata')
    expect(testoEsitoPreavviso({ campanellaCreata: false, push: 'gia-consegnata', giorni: 1, emailInviata: false })).toContain('push di rete già consegnata in un giro precedente: il giro tace')
    expect(testoEsitoPreavviso({ campanellaCreata: true, push: 'taciuta-sveglia', giorni: 3, emailInviata: false })).toContain('push di rete taciuta: sveglia armata')
    expect(testoEsitoPreavviso({ campanellaCreata: true, push: 'fallita', giorni: 3, emailInviata: false })).toContain('non consegnata: il giro riprova')
    expect(testoEsitoPreavviso({ campanellaCreata: true, push: 'none', giorni: 3, emailInviata: true })).toContain('email di cortesia inviata')
  })

  test('testoEsitoOggi: campanella quotidiana + la riserva "Scade OGGI"', () => {
    expect(testoEsitoOggi('none')).toBe('campanella quotidiana in app')
    expect(testoEsitoOggi('consegnata')).toContain('push "Scade OGGI" consegnata')
    expect(testoEsitoOggi('taciuta-sveglia')).toContain('sveglia confermata dal telefono')
    expect(testoEsitoOggi('fallita')).toContain('non consegnata: il giro riprova')
  })

  test('pulisciRegistro: restano le vive e le passate recenti, escono pagate, vecchie e cancellate', () => {
    const vecchia = new Date(ADESSO)
    vecchia.setDate(vecchia.getDate() - (GIORNI_CONSERVAZIONE + 10))
    const recente = new Date(ADESSO)
    recente.setDate(recente.getDate() - (GIORNI_CONSERVAZIONE - 5))
    const futura = new Date(ADESSO)
    futura.setDate(futura.getDate() + 3)
    const reg: RegistroSveglie = {
      'viva.pdf': { t: 'Viva', sc: futura.toISOString(), ant: 10, letta: false, voci: {} },
      'pagata.pdf': { t: 'Pagata', sc: futura.toISOString(), ant: 10, letta: false, voci: {} },
      'vecchia.pdf': { t: 'Vecchia', sc: vecchia.toISOString(), ant: 10, letta: false, voci: {} },
      'recente.pdf': { t: 'Recente', sc: recente.toISOString(), ant: 10, letta: false, voci: {} },
      'cancellata.pdf': { t: 'Cancellata', sc: futura.toISOString(), ant: 10, letta: false, voci: {} },
    }
    const righe = [
      { filePath: 'viva.pdf', pagata: false, dataScadenza: futura },
      { filePath: 'pagata.pdf', pagata: true, dataScadenza: futura },
      { filePath: 'vecchia.pdf', pagata: false, dataScadenza: vecchia },
      { filePath: 'recente.pdf', pagata: false, dataScadenza: recente },
      // cancellata.pdf non esiste piu' nel DB: esce dalla pulizia
    ]
    const next = pulisciRegistro(reg, ADESSO, righe)
    expect(Object.keys(next).sort()).toEqual(['recente.pdf', 'viva.pdf'])
  })

  test('unisciVoci: meta, voce per g sostituita e letta mai falsata a false', () => {
    const oggi = new Date('2026-10-26T09:30:00Z')
    let reg = unisciVoci({}, [
      { filePath: FP, titolo: 'Glifato', dataScadenza: oggi, anticipo: 3, g: 3, esito: 'campanella avvisi creata in app', letta: false },
    ])
    expect(reg[FP].t).toBe('Glifato')
    expect(reg[FP].voci['3'].esito).toContain('creata in app')
    reg = unisciVoci(reg, [
      { filePath: FP, titolo: 'Glifato', dataScadenza: oggi, anticipo: 3, g: 3, esito: 'campanella avvisi già in app', letta: true },
    ])
    // la voce di g=3 e' stata sostituita dal giro piu' recente...
    expect(reg[FP].voci['3'].esito).toContain('già in app')
    // ...e la prova letta, una volta vera, resta vera
    expect(reg[FP].letta).toBe(true)
    reg = unisciVoci(reg, [
      { filePath: FP, titolo: 'Glifato', dataScadenza: oggi, anticipo: 3, g: 0, esito: 'campanella quotidiana in app', letta: false },
    ])
    expect(reg[FP].letta).toBe(true)
    expect(Object.keys(reg[FP].voci).sort()).toEqual(['0', '3'])
  })
})

describe('il giro scrive il registro — integrazione con eseguiCheckScadenze', () => {
  test('giorno di piano (g=3): voce "3 giorni prima" con campanella creata + push taciuta (sveglia armata) e contatore sveglie:1', async () => {
    jest.useFakeTimers().setSystemTime(ADESSO)
    righeGiroEScadenzaPrune([scadenzaDiPiano], [])
    await eseguiCheckScadenze('test')

    const valore = upsertSveglie()
    expect(valore).toBeDefined()
    const reg = leggiRegistro(valore)
    expect(Object.keys(reg)).toEqual([FP])
    expect(reg[FP].t).toBe('Certificato P.IVA Glifato')
    expect(reg[FP].voci['3']).toBeDefined()
    expect(reg[FP].voci['3'].esito).toContain('campanella avvisi creata in app')
    expect(reg[FP].voci['3'].esito).toContain('push di rete taciuta: sveglia armata')
    expect(reg[FP].letta).toBe(false)

    // il registro di giro porta il contatore delle sveglie registrate
    const giro = (db.systemSetting.upsert as jest.Mock).mock.calls
      .map((c) => c[0])
      .find((u) => u.where?.key === 'ultimo_check_scadenze')
    expect(giro.update.value).toContain('sveglie:1')
    // e il giro ha creato la campanella in app (fatto del server)
    expect(db.notification.create).toHaveBeenCalled()
  })

  test('giorno stesso (g=0): voce "giorno stesso" con campanella quotidiana + push "Scade OGGI" consegnata', async () => {
    jest.useFakeTimers().setSystemTime(ADESSO)
    righeGiroEScadenzaPrune([scadenzaDiOggi], [])
    await eseguiCheckScadenze('test')

    const reg = leggiRegistro(upsertSveglie())
    expect(Object.keys(reg)).toEqual([FP])
    expect(reg[FP].voci['0']).toBeDefined()
    expect(reg[FP].voci['0'].esito).toContain('campanella quotidiana in app')
    expect(reg[FP].voci['0'].esito).toContain('push "Scade OGGI" consegnata')
    // la push di riserva e' davvero partita (fcm 1)
    expect(sendPushToUserCanali).toHaveBeenCalled()
  })

  test('campanella aperta dal cliente (read=true): la voce porta la prova "letta" che resta durable', async () => {
    jest.useFakeTimers().setSystemTime(ADESSO)
    aggiungiNotifica({
      userId: 'u1',
      type: 'scadenza',
      detail: FP,
      read: true, // il cliente ha toccato la campanella nell'app
      ts: new Date('2026-10-25T10:00:00Z'),
    })
    righeGiroEScadenzaPrune([scadenzaDiPiano], [])
    await eseguiCheckScadenze('test')

    const reg = leggiRegistro(upsertSveglie())
    expect(`campanella aperta dal cliente -> letta=${reg[FP].letta}`).toBe('campanella aperta dal cliente -> letta=true')
    // e la prova resta nella voce della sveglia, non solo nel meta
    expect(reg[FP].voci['3']).toBeDefined()
  })

  test('chiusura senza voci: il registro si pulisce ma le scadenze vive restano', async () => {
    jest.useFakeTimers().setSystemTime(ADESSO)
    const futura = new Date(ADESSO)
    futura.setDate(futura.getDate() + 3)
    const registroVecchio = {
      [FP]: { t: 'Glifato', sc: futura.toISOString(), ant: 3, letta: true, voci: { '3': { il: '2026-10-26T09:30:00Z', esito: 'campanella avvisi creata in app' } } },
      'pagata.pdf': { t: 'Pagata', sc: futura.toISOString(), ant: 10, letta: false, voci: {} },
    }
    ;(db.systemSetting.findUnique as jest.Mock).mockImplementation(async ({ where }: any) => {
      if (where?.key === CHIAVE_SVEGLIE) return { value: JSON.stringify(registroVecchio) }
      return null
    })
    ;(db.scadenza.findMany as jest.Mock).mockImplementation(async ({ where }: any) => {
      if (where?.filePath?.in) {
        return [
          { filePath: FP, pagata: false, dataScadenza: futura },
          { filePath: 'pagata.pdf', pagata: true, dataScadenza: futura },
        ]
      }
      return [] // nessuna scadenza da controllare oggi
    })

    await eseguiCheckScadenze('test')

    const reg = leggiRegistro(upsertSveglie())
    expect(Object.keys(reg)).toEqual([FP])
    expect(reg[FP].letta).toBe(true)
    expect(reg[FP].voci['3'].esito).toContain('creata in app')
  })

  test('giorno intermedio del piano (g=2): NESSUNA voce (non e\' una sveglia) e nessun registro nuovo', async () => {
    jest.useFakeTimers().setSystemTime(ADESSO)
    const g2 = { ...scadenzaDiPiano, dataScadenza: new Date('2026-10-28T00:00:00Z') } // 2 giorni dopo
    righeGiroEScadenzaPrune([g2], [])
    await eseguiCheckScadenze('test')

    // il giro lavora la scadenza (campanella + notificata) ma NON scrive voci
    expect(db.notification.create).toHaveBeenCalled()
    expect(upsertSveglie()).toBeUndefined()
    const giro = (db.systemSetting.upsert as jest.Mock).mock.calls
      .map((c) => c[0])
      .find((u) => u.where?.key === 'ultimo_check_scadenze')
    expect(giro.update.value).toContain('sveglie:0')
  })

  test('push di rete gia\' consegnata ai giorni di piano precedenti: il giro tace ma la voce del piano esiste (g=1)', async () => {
    jest.useFakeTimers().setSystemTime(ADESSO)
    const g1 = {
      ...scadenzaDiPiano,
      dataScadenza: new Date('2026-10-27T00:00:00Z'), // 1 giorno dopo: piano [3,1]
      notificata: true,
      pushInviata: true, // la push di rete e' arrivata al giorno g=3
    }
    righeGiroEScadenzaPrune([g1], [])
    await eseguiCheckScadenze('test')

    // il giro non ricrea la campanella e non spara push (tace di proposito)
    expect(db.notification.create).not.toHaveBeenCalled()
    expect(sendPushToUserCanali).not.toHaveBeenCalled()
    // ma la sveglia del piano e' registrata con la verita' completa
    const reg = leggiRegistro(upsertSveglie())
    expect(reg[FP].voci['1']).toBeDefined()
    expect(reg[FP].voci['1'].esito).toContain('campanella avvisi già in app')
    expect(reg[FP].voci['1'].esito).toContain('push di rete già consegnata in un giro precedente: il giro tace')
  })
})
