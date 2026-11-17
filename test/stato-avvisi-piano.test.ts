/**
 * v4.92 — statoAvvisiPiano (pfc-utils, client-safe): dove siamo nel piano
 * avvisi di una scadenza, calcolato dalla data + anticipo + orologio del
 * chiamante. La finestra "Promemoria scadenza" lo usa per le pillole di
 * stato, cosi' il mattino di un giorno di piano dice "avviso attivo" invece
 * di "non ancora avviata" (caso reale 17/11/2026, Glifato: sveglia 8:30
 * suonata, pillola grigia finche' il giro delle 10:15 non scriveva i flag).
 *
 * Le Date dei test sono costruite COL COSTRUTTORE LOCALE (new Date(y, m, d))
 * e la funzione confronta tutto sull'orologio del chiamante: il test e'
 * deterministico qualunque sia il fuso del nodo che lo esegue.
 */
import { statoAvvisiPiano, etichettaAnticipo } from '../src/lib/pfc-utils'

// La scadenza del caso reale: Certificato P.IVA Glifato_v2, 20/11/2026,
// anticipo 3 -> piano 17/11 (3 giorni prima), 19/11 (1), 20/11 (giorno stesso).
const SCADENZA = new Date(2026, 10, 20) // 20/11/2026 mezzanotte, orologio locale

const mattino17dopoSveglia = new Date(2026, 10, 17, 9, 0) // 17/11 ore 9:00 (caso reale: sveglia suonata, giro delle 10:15 non ancora passato)
const mattino17primaSveglia = new Date(2026, 10, 17, 7, 50) // 17/11 ore 7:50
const mezzo18 = new Date(2026, 10, 18, 12, 0) // 18/11: tra i giorni 3 e 1 del piano
const pomeriggio15 = new Date(2026, 10, 15, 15, 0) // 15/11: prima del primo giorno di piano
const mattino20 = new Date(2026, 10, 20, 9, 0) // 20/11 ore 9:00: giorno stesso, prima del giro
const mattino21 = new Date(2026, 10, 21, 9, 0) // 21/11: scadenza passata

describe('statoAvvisiPiano — caso reale Glifato (scadenza 20/11/2026, anticipo 3)', () => {
  test('il piano e` 17/11 (3), 19/11 (1), 20/11 (0) — il giorno stesso e` incluso', () => {
    const p = statoAvvisiPiano(SCADENZA, 3, mattino17dopoSveglia)!
    expect(p).not.toBeNull()
    expect(p.vociPiano.map((v) => v.g)).toEqual([3, 1, 0])
    expect(p.vociPiano[0].data.toDateString()).toBe(new Date(2026, 10, 17).toDateString())
    expect(p.vociPiano[1].data.toDateString()).toBe(new Date(2026, 10, 19).toDateString())
    expect(p.vociPiano[2].data.toDateString()).toBe(SCADENZA.toDateString())
  })

  test('17/11 ore 9:00 (sveglia suonata, giro non ancora passato): OGGI e` giorno di piano, sveglia gia` scattata', () => {
    const p = statoAvvisiPiano(SCADENZA, 3, mattino17dopoSveglia)!
    expect(p.oggiPiano).toBe(true)
    expect(p.svegliaGiaScattata).toBe(true)
    expect(p.giorniAllaScadenza).toBe(3)
    expect(p.passati).toHaveLength(0)
    expect(p.futuri.map((v) => v.g)).toEqual([1, 0])
  })

  test('17/11 ore 7:50: giorno di piano ma la sveglia non ha ancora scattato', () => {
    const p = statoAvvisiPiano(SCADENZA, 3, mattino17primaSveglia)!
    expect(p.oggiPiano).toBe(true)
    expect(p.svegliaGiaScattata).toBe(false)
  })

  test('17/11 ore 8:30 esatte: la sveglia conta come scattata', () => {
    const p = statoAvvisiPiano(SCADENZA, 3, new Date(2026, 10, 17, 8, 30))!
    expect(p.svegliaGiaScattata).toBe(true)
  })

  test('18/11: avviso in corso (17 gia` passato, restano 19 e 20)', () => {
    const p = statoAvvisiPiano(SCADENZA, 3, mezzo18)!
    expect(p.oggiPiano).toBe(false)
    expect(p.passati.map((v) => v.g)).toEqual([3])
    expect(p.futuri.map((v) => v.g)).toEqual([1, 0])
    expect(p.giorniAllaScadenza).toBe(2)
  })

  test('15/11: prima del primo giorno di piano (niente avviso attivo)', () => {
    const p = statoAvvisiPiano(SCADENZA, 3, pomeriggio15)!
    expect(p.oggiPiano).toBe(false)
    expect(p.passati).toHaveLength(0)
    expect(p.futuri.map((v) => v.g)).toEqual([3, 1, 0])
    expect(p.futuri[0].data.toDateString()).toBe(new Date(2026, 10, 17).toDateString())
  })

  test('20/11 ore 9:00: il giorno stesso e` giorno di piano, sveglia scattata', () => {
    const p = statoAvvisiPiano(SCADENZA, 3, mattino20)!
    expect(p.oggiPiano).toBe(true)
    expect(p.svegliaGiaScattata).toBe(true)
    expect(p.giorniAllaScadenza).toBe(0)
    expect(p.passati.map((v) => v.g)).toEqual([3, 1])
  })

  test('21/11: tutto il piano e` passato (la finestra mostrera` "passata senza conferma")', () => {
    const p = statoAvvisiPiano(SCADENZA, 3, mattino21)!
    expect(p.oggiPiano).toBe(false)
    expect(p.passati.map((v) => v.g)).toEqual([3, 1, 0])
    expect(p.futuri).toHaveLength(0)
  })

  test('data scadenza invalida -> null (l\u2019admin sta ancora scrivendo la data)', () => {
    expect(statoAvvisiPiano(new Date(NaN), 3, mattino17dopoSveglia)).toBeNull()
  })

  test('anticipo 10: il piano include la tacca fissa 10', () => {
    const p = statoAvvisiPiano(SCADENZA, 10, mattino17dopoSveglia)!
    expect(p.vociPiano.map((v) => v.g)).toEqual([10, 3, 1, 0])
  })

  test('anticipo 2: niente tacca 3, piano = 2, 1, 0', () => {
    const p = statoAvvisiPiano(SCADENZA, 2, mattino17dopoSveglia)!
    expect(p.vociPiano.map((v) => v.g)).toEqual([2, 1, 0])
  })
})

describe('etichettaAnticipo — le parole del piano, una sola per tutto il progetto', () => {
  test('0 / 1 / N giorni', () => {
    expect(etichettaAnticipo(0)).toBe('giorno stesso')
    expect(etichettaAnticipo(1)).toBe('1 giorno prima')
    expect(etichettaAnticipo(3)).toBe('3 giorni prima')
    expect(etichettaAnticipo(10)).toBe('10 giorni prima')
  })
})
