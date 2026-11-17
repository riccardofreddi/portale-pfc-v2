/**
 * v4.93 — pillolaScadenza (pfc-utils, client-safe): LO STATO DELL'AVVISO IN
 * UNA SOLA FUNZIONE, usata identica dalla pillola della LISTA archivio e
 * dalla finestra "Promemoria scadenza". Prima le due viste avevano logiche
 * separate e il 17/11/2026 la lista diceva "in attesa" mentre la finestra
 * diceva "Avviso di oggi: sveglia 8:30" per la STESSA scadenza (caso reale
 * Glifato: sveglia suonata alle 8:30, giro delle 10:49 con notificata=true,
 * lista cieca al piano). Da qui in poi una sola verita'.
 *
 * Date costruite col costruttore locale (come stato-avvisi-piano.test.ts):
 * test deterministico su qualunque fuso.
 */
import { pillolaScadenza } from '../src/lib/pfc-utils'

// La scadenza del caso reale: Certificato P.IVA Glifato_v2, 20/11/2026,
// anticipo 3 -> piano 17/11 (3 giorni prima), 19/11 (1), 20/11 (giorno stesso).
const SCADENZA = new Date(2026, 10, 20)
const ANTICIPO = 3

const mattino17dopoSveglia = new Date(2026, 10, 17, 9, 0) // 17/11 ore 9:00 (il caso reale dell'utente)
const mattino17primaSveglia = new Date(2026, 10, 17, 7, 50) // 17/11 ore 7:50
const mezzo18 = new Date(2026, 10, 18, 12, 0) // 18/11: tra i giorni 3 e 1 del piano
const pomeriggio15 = new Date(2026, 10, 15, 15, 0) // 15/11: prima del primo giorno di piano
const mattino20 = new Date(2026, 10, 20, 9, 0) // 20/11 ore 9:00: giorno stesso
const mattino21 = new Date(2026, 10, 21, 9, 0) // 21/11: scadenza passata
const futuro12 = new Date(2026, 11, 1, 12, 0) // 01/12: oltre il piano (passata)

const base = {
  dataScadenza: SCADENZA,
  anticipoGiorni: ANTICIPO,
  notificata: false,
  pushInviata: false,
  emailInviata: false,
  allarmeLocaleIl: null,
}

describe('pillolaScadenza — caso reale Glifato (scadenza 20/11/2026, anticipo 3)', () => {
  test('17/11 ore 9:00, sveglia suonata, giro non ancora passato: AMBER "sveglia oggi" in lista e finestra (niente piu` "in attesa" bugiarda)', () => {
    const p = pillolaScadenza({ ...base, notificata: true }, mattino17dopoSveglia)!
    expect(p.tono).toBe('amber')
    expect(p.lista).toBe('🔔 sveglia oggi')
    expect(p.etichetta).toBe('🔔 Avviso di oggi: sveglia 8:30')
    expect(p.riga).toContain('scattata oggi')
    expect(p.riga).toContain('Prova al 100%: non ancora')
    expect(p.riga).not.toContain('attesa')
  })

  test('17/11 ore 7:50 (prima della sveglia): amber, la riga dice che suonera` alle 8:30', () => {
    const p = pillolaScadenza({ ...base }, mattino17primaSveglia)!
    expect(p.tono).toBe('amber')
    expect(p.lista).toBe('🔔 sveglia oggi')
    expect(p.riga).toContain('suonerà')
    expect(p.riga).toContain('Prova al 100%: non ancora')
  })

  test('18/11 (tra due giorni di piano): amber "avviso in corso" con la prossima sveglia 19/11', () => {
    const p = pillolaScadenza({ ...base, notificata: true }, mezzo18)!
    expect(p.tono).toBe('amber')
    expect(p.lista).toBe('🔔 avviso in corso')
    expect(p.etichetta).toBe('🔔 Avviso in corso')
    expect(p.riga).toContain('19/11/2026')
    expect(p.riga).toContain('1 giorno prima')
    expect(p.riga).toContain('Prova al 100%: non ancora')
  })

  test('20/11 (giorno stesso): la riga parla della push di riserva delle 10:15', () => {
    const p = pillolaScadenza({ ...base }, mattino20)!
    expect(p.tono).toBe('amber')
    expect(p.lista).toBe('🔔 sveglia oggi')
    expect(p.riga).toContain('push di riserva')
    expect(p.riga).toContain('Prova al 100%: non ancora')
  })

  test('21/11 senza prova: grigio "passata senza conferma", NESSUNA pillola in lista', () => {
    const p = pillolaScadenza({ ...base, notificata: true }, mattino21)!
    expect(p.tono).toBe('grigio')
    expect(p.lista).toBe('')
    expect(p.etichetta).toBe('Scadenza passata senza conferma')
  })

  test('prova di consegna: VERDE "consegnata" con la prova push', () => {
    const p = pillolaScadenza({ ...base, pushInviata: true }, mattino17dopoSveglia)!
    expect(p.tono).toBe('verde')
    expect(p.lista).toBe('✓ consegnata')
    expect(p.etichetta).toBe('✅ Push consegnata')
    expect(p.riga).toContain('push')
    expect(p.riga.startsWith('Prova al 100%:')).toBe(true)
  })

  test('prova di consegna: sveglia confermata dall`app -> VERDE "Sveglia arrivata"', () => {
    const p = pillolaScadenza({ ...base, allarmeLocaleIl: '2026-11-20T08:31:00.000Z' }, mattino20)!
    expect(p.tono).toBe('verde')
    expect(p.etichetta).toBe('✅ Sveglia arrivata')
    expect(p.riga).toContain('scattata')
    expect(p.riga).toContain('confermata')
    expect(p.riga.startsWith('Prova al 100%:')).toBe(true)
  })

  test('email sola -> VERDE "Avvisato via email" (cliente senza canali push)', () => {
    const p = pillolaScadenza({ ...base, emailInviata: true }, mattino20)!
    expect(p.tono).toBe('verde')
    expect(p.etichetta).toBe('✅ Avvisato via email')
    expect(p.riga).toContain('email')
    expect(p.riga.startsWith('Prova al 100%:')).toBe(true)
  })

  test('futuro prima del piano (15/11): grigio "Non ancora avviata" che dice QUANDO scatta il primo avviso, lista senza pillola', () => {
    const p = pillolaScadenza({ ...base }, pomeriggio15)!
    expect(p.tono).toBe('grigio')
    expect(p.lista).toBe('')
    expect(p.etichetta).toBe('Non ancora avviata')
    expect(p.riga).toContain('17/11/2026')
    expect(p.riga).toContain('3 giorni prima')
  })

  test('avvio registrato (notificata) fuori dal piano e non ancora in corso: amber "in attesa" in lista e finestra', () => {
    // Caso limite: il giro ha gia` notificato (campanella) e poi la data/anticipo
    // e` stato modificato — la scadenza ora e` 30/11 con piano 27/29/30/11, oggi
    // e` 18/11: nessun giorno di piano ancora trascorso, ma l'avvio e` registrato.
    const p = pillolaScadenza({ ...base, dataScadenza: new Date(2026, 10, 30), notificata: true }, mezzo18)!
    expect(p.tono).toBe('amber')
    expect(p.lista).toBe('⏳ in attesa')
    expect(p.etichetta).toBe('⏳ In attesa di consegna')
  })

  test('anticipo 0 (non valido): difesa NaN come l`app -> default 10, piano 10/3/1', () => {
    // scadenza 20/11 con anticipo "0" = non valido: il piano diventa 10/3/1 e
    // il 18/11 un giorno di piano (17/11) e` gia` passato -> avviso in corso.
    const p = pillolaScadenza({ ...base, anticipoGiorni: 0, notificata: true }, mezzo18)!
    expect(p.tono).toBe('amber')
    expect(p.lista).toBe('🔔 avviso in corso')
    expect(p.riga).toContain('19/11/2026')
  })

  test('data non valida -> null (admin sta scrivendo, niente pillola)', () => {
    expect(pillolaScadenza({ ...base, dataScadenza: new Date(NaN) }, mattino17dopoSveglia)).toBeNull()
  })

  test('v4.94 — la certezza si legge: OGNI amber dice "Prova al 100%: non ancora", OGNI verde inizia con "Prova al 100%:"', () => {
    const amb: Array<[string, Date, Record<string, unknown>, Date]> = [
      ['oggi piano, sveglia scattata', SCADENZA, {}, mattino17dopoSveglia],
      ['oggi piano, prima della sveglia', SCADENZA, {}, mattino17primaSveglia],
      ['giorno stesso, scattata', SCADENZA, {}, mattino20],
      ['avviso in corso', SCADENZA, { notificata: true }, mezzo18],
      ['in attesa, fuori piano', new Date(2026, 10, 30), { notificata: true }, mezzo18],
    ]
    for (const [desc, scad, flags, adesso] of amb) {
      const p = pillolaScadenza({ ...base, dataScadenza: scad, ...flags }, adesso)!
      expect(`${desc} -> ${p.tono}`).toBe(`${desc} -> amber`)
      expect(`${desc} -> ${p.riga}`).toContain('Prova al 100%: non ancora')
    }
    const verdi: Array<[string, Record<string, unknown>]> = [
      ['push', { pushInviata: true }],
      ['sveglia confermata', { allarmeLocaleIl: '2026-11-20T08:31:00.000Z' }],
      ['email', { emailInviata: true }],
    ]
    for (const [desc, flags] of verdi) {
      const p = pillolaScadenza({ ...base, ...flags }, mattino20)!
      expect(`${desc} -> ${p.tono}`).toBe(`${desc} -> verde`)
      expect(`${desc} -> ${p.riga.startsWith('Prova al 100%:')}`).toBe(`${desc} -> true`)
    }
  })

  test('v4.94 — i grigi non promettono prove: passata senza conferma e Non ancora avviata non dicono "Prova al 100%"', () => {
    const passata = pillolaScadenza({ ...base, notificata: true }, mattino21)!
    expect(passata.riga).not.toContain('Prova al 100%')
    const futura = pillolaScadenza({ ...base }, pomeriggio15)!
    expect(futura.riga).not.toContain('Prova al 100%')
  })

  test('la lista e la finestra ricevono la STESSA verita` (stessa funzione, due formati)', () => {
    const a = pillolaScadenza({ ...base, notificata: true }, mattino17dopoSveglia)!
    const b = pillolaScadenza({ ...base, notificata: true }, mattino17dopoSveglia)!
    // deterministica: due chiamate, stesso risultato
    expect(a.lista).toBe(b.lista)
    expect(a.etichetta).toBe(b.etichetta)
    // e nel caso reale il tono e` lo stesso per lista e finestra (amber)
    expect(a.tono).toBe(b.tono)
  })

  test('12/12/2026 (oltre la scadenza): grigio passata, riga breve', () => {
    const p = pillolaScadenza({ ...base }, futuro12)!
    expect(p.tono).toBe('grigio')
    expect(p.etichetta).toBe('Scadenza passata senza conferma')
    expect(p.riga.length).toBeLessThan(140)
  })
})
