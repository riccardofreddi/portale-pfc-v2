/**
 * v4.95 — REGISTRO SVEGLIE PER SCADENZA: la verita' completa del piano
 * avvisi, sveglia per sveglia.
 *
 * IL PROBLEMA (domanda reale dell'utente: "perche' non ci sono tutte le
 * scadenze notificate? quelle del 10-3-1 + oggi"): fino alla v4.94 il giro
 * del check scriveva SOLO il flag notificata (UNA volta per scadenza, al
 * primo avvio) e il registro di giro (ultimo_check_scadenze) era UNA riga
 * sola riscritta a ogni giro. Risultato: il piano ha 4 sveglie (anticipo o
 * 10, 3, 1, giorno stesso) ma nessuna vista mostrava cosa il giro aveva
 * fatto per OGNI sveglia: il contatore notificate:N conta le scadenze
 * lavorate in QUEL giro, non le sveglie del piano, e la storia dei giorni
 * precedenti spariva con il giro dopo.
 *
 * LA SOLUZZE: come il registro di giro (v4.87), il registro vive in
 * system_settings (chiave "sveglie_scadenze"), SEMPRE una riga sola,
 * crescita zero (le voci vecchie si potano a ogni giro). Chiave esterna =
 * filePath (UNICA per scadenza nello schema Prisma, e disponibile ovunque:
 * giro, /scadenza/tutte, finestra admin senza threadare id). Forma:
 *
 *   { [filePath]: {
 *       t: titolo, sc: dataScadenza ISO, ant: anticipoGiorni,
 *       letta: boolean   // la campanella in app e' stata APERTA dal cliente
 *                        // (notifications.read=true): prova di consegna
 *                        // durable anche dopo "pulisci lette" dell'app
 *       voci: { [g]: { il: ISO, esito: string } }  // g = giorni prima:
 *                        // "10"/"3"/"1" = giorni di piano, "0" = giorno stesso
 *     } }
 *
 * `esito` descrive SOLO fatti del SERVER (campanella creata/gia' in app,
 * push di rete consegnata/taciuta/fallita, email di cortesia): mai eventi
 * del telefono, che restano alle prove vere (allarmeLocaleIl, pushInviata,
 * emailInviata, campanella letta). Il "Prova al 100%" resta alla pillola.
 *
 * Tutto best-effort: il registro non puo' MAI rompere il giro che lo
 * scrive (stesso principio di registraGiro v4.87).
 */
import { db } from './db'

export const CHIAVE_SVEGLIE = 'sveglie_scadenze'

/** Quanto tempo resta la storia di una scadenza passata nel registro. */
export const GIORNI_CONSERVAZIONE = 21

export type VoceSveglia = { il: string; esito: string }
export type RegistroScadenza = {
  t: string
  sc: string
  ant: number
  letta: boolean
  voci: Record<string, VoceSveglia>
}
export type RegistroSveglie = Record<string, RegistroScadenza>

/** Quello che il giro ha fatto per UNA sveglia di UNA scadenza, in QUESTO giro. */
export type VoceDelGiro = {
  filePath: string
  titolo: string
  dataScadenza: Date
  anticipo: number
  /** giorni prima della scadenza: 10/3/1 (o l'anticipo) = sveglia di piano, 0 = giorno stesso */
  g: number
  esito: string
  letta: boolean
}

/** Stato della push di rete per una sveglia, come lo vede il giro. */
export type StatoPush = 'none' | 'consegnata' | 'taciuta-sveglia' | 'fallita' | 'gia-consegnata'

/**
 * Parse sicuro del registro: valore assente/corrotto = registro vuoto
 * (il giro lo riscrive pulito, come per ultimo_check_scadenze).
 */
export function leggiRegistro(raw: string | null | undefined): RegistroSveglie {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const reg: RegistroSveglie = {}
    for (const [fp, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!fp || !v || typeof v !== 'object') continue
      const r = v as Partial<RegistroScadenza>
      if (typeof r.t !== 'string' || typeof r.sc !== 'string') continue
      reg[fp] = {
        t: r.t,
        sc: r.sc,
        ant: Number.isFinite(r.ant) ? Number(r.ant) : 10,
        letta: r.letta === true,
        voci: r.voci && typeof r.voci === 'object' ? { ...r.voci } : {},
      }
    }
    return reg
  } catch {
    return {}
  }
}

/**
 * Pulizia a ogni giro: restano solo le scadenze vive (non pagate, non
 * cancellate) e le passate da meno di GIORNI_CONSERVAZIONE giorni (la
 * storia serve all'admin anche dopo la scadenza, poi esce da sola).
 */
export function pulisciRegistro(
  reg: RegistroSveglie,
  adesso: Date,
  righe: Array<{ filePath: string; pagata: boolean; dataScadenza: Date | null }>,
): RegistroSveglie {
  const perFile = new Map(righe.map((r) => [r.filePath, r]))
  const soglia = new Date(adesso.getTime())
  soglia.setDate(soglia.getDate() - GIORNI_CONSERVAZIONE)
  const next: RegistroSveglie = {}
  for (const [fp, voce] of Object.entries(reg)) {
    const riga = perFile.get(fp)
    if (!riga) continue // scadenza cancellata: la storia esce
    if (riga.pagata) continue
    const sc = riga.dataScadenza ? new Date(riga.dataScadenza) : null
    if (sc && !isNaN(sc.getTime()) && sc < soglia) continue
    next[fp] = voce
  }
  return next
}

/**
 * La frase della sveglia di PIANO (g = anticipo/10/3/1): solo fatti del
 * server, perche' il telefono racconta le sue prove altrove (pillola).
 */
export function testoEsitoPreavviso(opts: {
  campanellaCreata: boolean
  push: StatoPush
  giorni: number
  emailInviata: boolean
}): string {
  const parti: string[] = [
    opts.campanellaCreata ? 'campanella avvisi creata in app' : 'campanella avvisi già in app',
  ]
  if (opts.push === 'consegnata')
    parti.push(`push di rete "Scade tra ${opts.giorni} giorni" consegnata (app chiusa)`)
  if (opts.push === 'gia-consegnata')
    parti.push('push di rete già consegnata in un giro precedente: il giro tace')
  if (opts.push === 'taciuta-sveglia')
    parti.push('push di rete taciuta: sveglia armata dall\'app')
  if (opts.push === 'fallita')
    parti.push('push di rete non consegnata: il giro riprova')
  if (opts.emailInviata) parti.push('email di cortesia inviata')
  return parti.join(' · ')
}

/**
 * La frase della sveglia del GIORNO STESSO (g=0): campanella quotidiana +
 * la riserva "Scade OGGI" (consegnata / taciuta perche' la sveglia e'
 * stata confermata dal telefono / non consegnata: riprova).
 */
export function testoEsitoOggi(push: StatoPush): string {
  const parti: string[] = ['campanella quotidiana in app']
  if (push === 'consegnata') parti.push('push "Scade OGGI" consegnata')
  if (push === 'taciuta-sveglia')
    parti.push('push "Scade OGGI" taciuta: sveglia confermata dal telefono')
  if (push === 'fallita') parti.push('push "Scade OGGI" non consegnata: il giro riprova')
  return parti.join(' · ')
}

/** Unisce le voci del giro nel registro: meta per file, letta mai falsata a false, voce per g sostituita. */
export function unisciVoci(reg: RegistroSveglie, voci: VoceDelGiro[]): RegistroSveglie {
  const next: RegistroSveglie = { ...reg }
  for (const v of voci) {
    const esistente = next[v.filePath]
    const voce: RegistroScadenza = esistente
      ? { ...esistente, t: v.titolo, sc: v.dataScadenza.toISOString(), ant: v.anticipo }
      : { t: v.titolo, sc: v.dataScadenza.toISOString(), ant: v.anticipo, letta: false, voci: {} }
    if (v.letta) voce.letta = true // una volta letta resta letta: prova durable
    voce.voci = { ...voce.voci, [String(v.g)]: { il: new Date().toISOString(), esito: v.esito } }
    next[v.filePath] = voce
  }
  return next
}

/** Il registro dal DB (best-effort: DB irraggiungibile = registro vuoto). */
export async function leggiRegistroSveglie(): Promise<RegistroSveglie> {
  try {
    const setting = await db.systemSetting.findUnique({
      where: { key: CHIAVE_SVEGLIE },
      select: { value: true },
    })
    return leggiRegistro(setting?.value)
  } catch {
    return {}
  }
}

/**
 * La prova campanella per UNA scadenza: esiste una campanella di questa
 * scadenza APERTA dal cliente (read=true; l'app la scrive al tocco sulla
 * notifica o sul pulsante della push). Best-effort: errore = false.
 */
export async function campanellaLetta(userId: string, filePath: string): Promise<boolean> {
  try {
    const n = await db.notification.findFirst({
      where: {
        userId,
        detail: filePath,
        read: true,
        OR: [{ type: 'scadenza' }, { type: 'scadenza_oggi' }],
      },
      select: { id: true },
    })
    return !!n
  } catch {
    return false
  }
}

/**
 * Chiusura del registro a fine giro: pulizia + unione delle voci del giro
 * + scrittura. Tutto best-effort: il registro non puo' rompere il giro.
 */
export async function chiudiRegistroSveglie(voci: VoceDelGiro[]): Promise<void> {
  try {
    const corrente = await leggiRegistroSveglie()
    const chiavi = Object.keys(corrente)
    let reg = corrente
    if (chiavi.length > 0) {
      // Pulizia: scadenze vive? (una query sola: cancellate escono, pagate
      // e passate oltre la conservazione anche).
      const righe = await db.scadenza.findMany({
        where: { filePath: { in: chiavi } },
        select: { filePath: true, pagata: true, dataScadenza: true },
      })
      reg = pulisciRegistro(reg, new Date(), righe)
    }
    const unito = unisciVoci(reg, voci)
    const cambiato = JSON.stringify(unito) !== JSON.stringify(corrente)
    if (!cambiato) return
    await db.systemSetting.upsert({
      where: { key: CHIAVE_SVEGLIE },
      update: { value: JSON.stringify(unito) },
      create: { key: CHIAVE_SVEGLIE, value: JSON.stringify(unito) },
    })
  } catch {
    // il registro non puo' rompere il giro
  }
}
