/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Test dell'AUTO-GUARIGIONE del check scadenze (v4.91).
 *
 * forseRimedioGiroMancato fa partire il giro completo del check SOLO se:
 *   1. sono passate le 10:00 italiane (prima la finestra push e' chiusa e
 *      un giro "brucerebbe" la cura senza consegnare la riserva);
 *   2. il giro di OGGI (giorno ITALIANO, non UTC) manca ancora nel registro
 *      ultimo_check_scadenze (cron Vercel perso o in ritardo).
 * Se il giro di oggi c'e' gia' (cron o piggyback precedente) tace: una sola
 * cura al giorno. Le date finte sono nell'ultima settimana di ottobre 2026,
 * dopo il cambio all'ora solare: l'Italia e' UTC+1.
 */
import { forseRimedioGiroMancato } from '../src/lib/scadenze-check'
// Il mock (non il db reale): scadenze-check prende './db' via moduleNameMapper,
// quindi e' lo STESSO oggetto mock che il test legge qui sotto.
import { db } from './mocks/db'

jest.mock('../src/lib/push', () => require('./mocks/push'))
jest.mock('../src/lib/email', () => require('./mocks/email'))

const giroDi = (ts: string) => ({
  value: JSON.stringify({ ts, detail: 'ok via test' }),
})

beforeEach(() => {
  jest.clearAllMocks()
  ;(db.scadenza.findMany as jest.Mock).mockResolvedValue([])
})

afterEach(() => {
  jest.useRealTimers()
})

describe('forseRimedioGiroMancato — la cura parte solo se serve', () => {
  test('giro di oggi gia\' fatto (stesso giorno ITALIANO) -> tace', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-26T09:30:00Z')) // 10:30 it.
    ;(db.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      giroDi('2026-10-26T06:00:00Z') // 07:00 it. di OGGI: il cron e' gia' passato
    )

    await forseRimedioGiroMancato('test')

    expect(db.scadenza.findMany).not.toHaveBeenCalled() // nessun giro
    expect(db.systemSetting.upsert).not.toHaveBeenCalled()
  })

  test('giro mancato (ultimo = ieri) + dopo le 10:00 it. -> fa partire il giro e scrive il registro', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-26T09:30:00Z')) // 10:30 it.
    ;(db.systemSetting.findUnique as jest.Mock).mockResolvedValue(
      giroDi('2026-10-25T09:30:00Z') // 25/10 it.: IERI
    )

    await forseRimedioGiroMancato('test')

    expect(db.scadenza.findMany).toHaveBeenCalledTimes(1) // il giro e' partito
    expect(db.systemSetting.upsert).toHaveBeenCalledTimes(1) // registro riscritto
    expect((db.systemSetting.upsert as jest.Mock).mock.calls[0][0].where.key).toBe(
      'ultimo_check_scadenze'
    )
  })

  test('prima delle 10:00 italiane -> tace anche senza giro (la finestra push e\' chiusa)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-26T07:30:00Z')) // 08:30 it.
    ;(db.systemSetting.findUnique as jest.Mock).mockResolvedValue(null)

    await forseRimedioGiroMancato('test')

    expect(db.scadenza.findMany).not.toHaveBeenCalled()
  })

  test('registro illeggibile dopo le 10:00 -> cura comunque (il giro riscrive il registro pulito)', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-26T09:30:00Z')) // 10:30 it.
    ;(db.systemSetting.findUnique as jest.Mock).mockResolvedValue({ value: 'non-json' })

    await forseRimedioGiroMancato('test')

    expect(db.scadenza.findMany).toHaveBeenCalledTimes(1)
    expect(db.systemSetting.upsert).toHaveBeenCalledTimes(1)
  })
})
