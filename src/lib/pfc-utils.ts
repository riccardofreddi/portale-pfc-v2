/**
 * Utility condivise — Portale PFC.
 */

import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'

export const MAX_FILE_SIZE_MB = 20
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
export const DEFAULT_ADMIN_USER = 'admin'
export const PAGE_SIZE = 10

export function sanitizzaNomeFile(filename: string, fallback = 'documento'): string {
  let nome = (filename ?? '').replace(/\\/g, '/').split('/').pop() ?? ''
  nome = nome.replace(/[\x00-\x1f\x7f]/g, '').trim()
  nome = nome.replace(/[<>:"/\\|?*]+/g, '_')
  nome = nome.replace(/^[.\s]+|[.\s]+$/g, '')
  if (!nome || nome === '.' || nome === '..') return fallback
  if (nome.length > 240) {
    const dotIdx = nome.lastIndexOf('.')
    const ext = dotIdx >= 0 ? nome.slice(dotIdx) : ''
    const base = dotIdx >= 0 ? nome.slice(0, dotIdx) : nome
    nome = base.slice(0, 240 - ext.length) + ext
  }
  return nome
}

export function sanitizzaNomeCartella(nome: string, fallback = 'CARTELLA'): string {
  let pulito = (nome ?? '').replace(/\\/g, '/').split('/').pop() ?? ''
  pulito = pulito.replace(/[\x00-\x1f\x7f]/g, '').trim()
  pulito = pulito.replace(/[<>:"/\\|?*]+/g, '_')
  pulito = pulito.replace(/^[.\s]+|[.\s]+$/g, '')
  if (!pulito || pulito === '.' || pulito === '..') return fallback
  if (pulito.length > 240) pulito = pulito.slice(0, 240)
  return pulito
}

const SUPPORTED_EXTENSIONS: Record<string, { icon: string; class: string; bg: string; fg: string }> = {
  pdf:  { icon: 'PDF', class: 'file-pdf',   bg: '#fde8e8', fg: '#c62828' },
  jpg:  { icon: 'IMG', class: 'file-img',   bg: '#ede7f6', fg: '#6a1b9a' },
  jpeg: { icon: 'IMG', class: 'file-img',   bg: '#ede7f6', fg: '#6a1b9a' },
  png:  { icon: 'IMG', class: 'file-img',   bg: '#ede7f6', fg: '#6a1b9a' },
  svg:  { icon: 'IMG', class: 'file-img',   bg: '#ede7f6', fg: '#6a1b9a' },
  doc:  { icon: 'DOC', class: 'file-word',   bg: '#e3f2fd', fg: '#1565c0' },
  docx: { icon: 'DOC', class: 'file-word',   bg: '#e3f2fd', fg: '#1565c0' },
  odt:  { icon: 'DOC', class: 'file-word',   bg: '#e3f2fd', fg: '#1565c0' },
  xls:  { icon: 'XLS', class: 'file-xls',    bg: '#e8f5e9', fg: '#2e7d32' },
  xlsx: { icon: 'XLS', class: 'file-xls',    bg: '#e8f5e9', fg: '#2e7d32' },
  csv:  { icon: 'CSV', class: 'file-csv',    bg: '#e8f5e9', fg: '#2e7d32' },
  txt:  { icon: 'TXT', class: 'file-txt',    bg: '#f5f5f5', fg: '#616161' },
  zip:  { icon: 'ZIP', class: 'file-zip',    bg: '#fff3e0', fg: '#e65100' },
  rar:  { icon: 'RAR', class: 'file-zip',    bg: '#fff3e0', fg: '#e65100' },
}

const DEFAULT_ICON = { icon: 'FILE', class: 'file-unknown', bg: '#f5f5f5', fg: '#616161' }

export function ottieniIconaFile(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return SUPPORTED_EXTENSIONS[ext] ?? DEFAULT_ICON
}

export function canPreviewFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return ['pdf', 'jpg', 'jpeg', 'png'].includes(ext)
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const v = bytes / Math.pow(1024, i)
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatDate(d: Date | string | number): string {
  const date = typeof d === 'string' ? parseISO(d) : new Date(d)
  if (isNaN(date.getTime())) return '—'
  return format(date, 'd MMM yyyy, HH:mm', { locale: it })
}

export function formatDateShort(d: Date | string | number): string {
  const date = typeof d === 'string' ? parseISO(d) : new Date(d)
  if (isNaN(date.getTime())) return '—'
  return format(date, 'd MMM yyyy', { locale: it })
}

export function formatDateAudit(ts: string): string {
  try {
    const date = ts.includes('T') ? parseISO(ts) : parseISO(ts.replace(' ', 'T'))
    if (isNaN(date.getTime())) return ts
    return format(date, 'd MMM yyyy, HH:mm', { locale: it })
  } catch {
    return ts
  }
}

export function getInitials(name: string): string {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

// Validazione email "buona enough" per un form aziendale.
// L'email del cliente e' opzionale: se vuota ritorna ok:true (normalized: null).
const EMAIL_REGEX = /^[^s@]+@[^s@]+.[^s@]+$/
export function validaEmail(raw: string): { ok: boolean; normalized: string | null; msg: string } {
  const email = String(raw ?? '').trim().toLowerCase()
  if (!email) return { ok: true, normalized: null, msg: '' } // opzionale
  if (email.length > 254) return { ok: false, normalized: null, msg: 'Email troppo lunga' }
  if (!EMAIL_REGEX.test(email)) return { ok: false, normalized: null, msg: 'Inserisci un indirizzo email valido' }
  return { ok: true, normalized: email, msg: '' }
}

/**
 * v4.90 — I giorni di PREAVVISO di una scadenza, STESSA regola di app e
 * server (app: src/lib/scadenze-locali.ts v4.124): l'anticipo scelto dallo
 * studio entra lui stesso nei preavvisi, insieme alle tacche fisse 10/3/1,
 * filtrate a [1..anticipo] e senza doppioni. Esempi: anticipo 4 -> [4, 3, 1];
 * anticipo 10 -> [10, 3, 1]; anticipo 2 -> [2, 1]; anticipo 1 -> [1].
 * Difesa NaN come l'app: anticipo non valido = 10 (il default del server).
 * Regola UNA per tutto il progetto: la sveglia 08:30 del telefono e la push
 * di riserva del server escono esattamente in questi giorni, e la finestra
 * "Promemoria scadenza" dell'admin disegna il piano con questa funzione
 * (scadenza-notify.ts la re-esporta per il cron).
 */
export function giorniDiPreavviso(anticipoGiorni: number): number[] {
  const anticipo = Number.isFinite(anticipoGiorni) && anticipoGiorni > 0 ? anticipoGiorni : 10
  return Array.from(new Set([anticipo, 10, 3, 1]))
    .filter((n) => n >= 1 && n <= anticipo)
    .sort((a, b) => b - a)
}

/** v4.92 — Le PAROLE dei giorni del piano, una sola per tutto il progetto
 * (finestra admin: sezione "Piano avvisi" e pillole di stato; test). */
export function etichettaAnticipo(g: number): string {
  if (g === 1) return '1 giorno prima'
  if (g === 0) return 'giorno stesso'
  return `${g} giorni prima`
}

/**
 * v4.92 — DOVE SIAMO NEL PIANO AVVISI, calcolato dalla data e dall'anticipo
 * senza toccare il database (client-safe: nessun import server). Serve alla
 * finestra "Promemoria scadenza" dell'admin per dire la verita' ANCHE PRIMA
 * che il giro delle 10:15 scriva i suoi flag: la sveglia 8:30 e' l'avviso
 * vero e scatta SUL TELEFONO del cliente nei giorni del piano, quindi il
 * mattino del primo giorno di piano (8:30-10:15) lo stato non puo' dire
 * "non ancora avviata" (caso reale 17/11/2026, Glifato: sveglia suonata
 * alle 8:30, pillola grigia "non ancora avviata" finche' il giro non era
 * passato — la finestra mostrava "Non ancora avviata" sotto un piano che
 * diceva 17/11 come giorno di avviso, smentendosi da sola).
 *
 * `adesso` e' la Date del chiamante: nel browser e' l'orologio dell'admin
 * (ora italiana), nei test e' fisso e deterministico. Torna null se la
 * data non e' valida.
 *
 * vociPiano = le date delle sveglie: i giorni di giorniDiPreavviso(anticipo)
 * PIU' il giorno stesso (g=0, che non fa parte di giorniDiPreavviso ma il
 * piano lo mostra e la sveglia del giorno stesso esiste), ordinati dal piu'
 * lontano al piu' vicino. Confronti tutti sull'orologio del chiamante:
 * stesso orologio = nessun errore di fuso.
 */
export function statoAvvisiPiano(
  dataScadenza: Date,
  anticipoGiorni: number,
  adesso: Date,
): {
  vociPiano: Array<{ g: number; data: Date }>
  oggiPiano: boolean
  passati: Array<{ g: number; data: Date }>
  futuri: Array<{ g: number; data: Date }>
  svegliaGiaScattata: boolean
  giorniAllaScadenza: number
} | null {
  const t = dataScadenza.getTime()
  if (!Number.isFinite(t) || isNaN(t)) return null
  const inizioOggi = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate())
  const fineOggi = new Date(inizioOggi.getTime())
  fineOggi.setDate(fineOggi.getDate() + 1)
  const vociPiano = [
    ...giorniDiPreavviso(anticipoGiorni).map((g) => {
      const d = new Date(t)
      d.setDate(d.getDate() - g)
      return { g, data: d }
    }),
    { g: 0, data: new Date(t) },
  ].sort((a, b) => a.data.getTime() - b.data.getTime())
  const scadMezzanotte = new Date(
    dataScadenza.getFullYear(),
    dataScadenza.getMonth(),
    dataScadenza.getDate(),
  )
  return {
    vociPiano,
    oggiPiano: vociPiano.some((v) => v.data >= inizioOggi && v.data < fineOggi),
    passati: vociPiano.filter((v) => v.data < inizioOggi),
    futuri: vociPiano.filter((v) => v.data >= fineOggi),
    svegliaGiaScattata: adesso.getHours() * 60 + adesso.getMinutes() >= 8 * 60 + 30,
    giorniAllaScadenza: Math.round((scadMezzanotte.getTime() - inizioOggi.getTime()) / 86400000),
  }
}

/**
 * v4.93 — LO STATO DELL'AVVISO IN UNA SOLA FUNZIONE, usata identica dalla
 * pillola della LISTA archivio (Gestione Clienti) e dalla finestra
 * "Promemoria scadenza". Prima le due viste avevano logiche separate
 * (lista: solo flag server, v4.88; finestra: piano avvisi, v4.92) e il
 * 17/11/2026 la lista diceva "in attesa" mentre la finestra diceva
 * "Avviso di oggi: sveglia 8:30" per la STESSA scadenza — la sveglia era
 * suonata e la lista non lo sapeva dire. Da qui in poi una sola verita'.
 *
 * Ordine di giudizio (il primo che vale):
 *  1. prova di consegna (pushInviata / allarmeLocaleIl / emailInviata) -> VERDE
 *     "consegnata": l'avviso e' arrivato davvero sul telefono, con la prova.
 *  2. scadenza passata senza prova -> GRIGIO "passata senza conferma"
 *     (lista: niente pillola, la storia e' finita).
 *  3. oggi e' un giorno del piano -> AMBER "sveglia oggi": la sveglia 8:30
 *     e' l'avviso vero, prima o dopo le 8:30 la riga lo dice di conseguenza.
 *  4. tra due giorni del piano -> AMBER "avviso in corso" con la prossima
 *     sveglia.
 *  5. avvio gia' registrato dal check (notificata, fuori dal piano) ->
 *     AMBER "in attesa".
 *  6. futuro prima del primo giorno di piano -> GRIGIO "Non ancora avviata"
 *     (lista: niente pillola, come prima della v4.93).
 *
 * `riga` e' la UNICA frase sotto la pillola nella finestra: corta di
 * proposito (la v4.93 taglia i paragrafi lunghi). `lista` e' la pillola
 * corta della lista archivio ('' = nessuna pillola).
 *
 * v4.94 — la certezza si legge, non si indovina: OGNI riga non-verde
 * finisce con "Prova al 100%: non ancora" (amber = avviso programmato e,
 * per orologio, gia' scattato — ma la ricevuta non e' ancora scritta nel
 * DB), OGNI riga verde inizia con "Prova al 100%:" (la prova c'e', con la
 * data quando il telefono l'ha confermata). Domanda reale dell'utente
 * dopo la v4.93: "e' sicuro che e' arrivata la notifica? devo essere
 * sicuro al 100 per cento" — la riga "l'avviso vero e' quello" sembrava
 * una ricevuta e non lo era.
 *
 * v4.95 — QUARTA PROVA DI CONSEGNA: la campanella in app. Il flag read
 * della notifica (notifications.read) diventa true SOLO quando il cliente
 * tocca la campanella nell'app (o il pulsante "Segna come letta" della
 * push): e' una prova SCRITTA nel DB che l'avviso e' arrivato e stato
 * VISTO, anche quando push/sveglia/email non hanno niente (il giro tace
 * perche' la sveglia e' armata). Registro sveglie (sveglie-registro.ts)
 * e /scadenza/tutte la calcolano; qui diventa verde "Vista in app",
 * preceduta da push e sveglia, prima dell'email.
 *
 * Torna null solo se la data non e' valida (admin sta scrivendo).
 */
export function pillolaScadenza(
  s: {
    dataScadenza: Date
    anticipoGiorni: number
    notificata?: boolean
    pushInviata?: boolean
    emailInviata?: boolean
    allarmeLocaleIl?: string | null
    /** v4.95: la campanella in app e' stata aperta dal cliente (read=true o registro sveglie). */
    campanellaLetta?: boolean
  },
  adesso: Date,
): { tono: 'verde' | 'amber' | 'grigio'; lista: string; etichetta: string; riga: string } | null {
  const piano = statoAvvisiPiano(s.dataScadenza, s.anticipoGiorni, adesso)
  if (!piano) return null
  const push = s.pushInviata === true
  const sveglia = s.allarmeLocaleIl != null
  const email = s.emailInviata === true
  const campanella = s.campanellaLetta === true
  const passata = piano.giorniAllaScadenza < 0
  const fmt = (d: Date) => d.toLocaleDateString('it-IT')
  if (push || sveglia || campanella || email) {
    return {
      tono: 'verde',
      lista: '✓ consegnata',
      etichetta: push
        ? '✅ Push consegnata'
        : sveglia
          ? '✅ Sveglia arrivata'
          : campanella
            ? '✅ Vista in app'
            : '✅ Avvisato via email',
      riga: push
        ? 'Prova al 100%: la push di riserva è stata consegnata sul telefono del cliente.'
        : sveglia
          ? `Prova al 100%: la sveglia 8:30 è scattata e il telefono del cliente l'ha confermata${s.allarmeLocaleIl ? ` il ${fmt(new Date(s.allarmeLocaleIl))}` : ''}.`
          : campanella
            ? 'Prova al 100%: la campanella in app è stata aperta dal cliente (avviso visto).'
            : 'Prova al 100%: l\'avviso è partito via email al cliente (nessun canale push).',
    }
  }
  if (passata) {
    return {
      tono: 'grigio',
      lista: '',
      etichetta: 'Scadenza passata senza conferma',
      riga: 'La scadenza è passata e il check non riprova più: il cliente ha comunque la campanella in app.',
    }
  }
  if (piano.oggiPiano) {
    const ultimoGiorno = piano.giorniAllaScadenza === 0
    return {
      tono: 'amber',
      lista: '🔔 sveglia oggi',
      etichetta: '🔔 Avviso di oggi: sveglia 8:30',
      riga: ultimoGiorno
        ? piano.svegliaGiaScattata
          ? 'Sveglia 8:30 scattata oggi sul telefono (programmata dall\'app). Prova al 100%: non ancora — se il cliente non apre l\'app, alle 10:15 il giro manda la push di riserva.'
          : 'La sveglia suonerà alle 8:30 (programmata: suona anche a app chiusa). Prova al 100%: non ancora — se serve, alle 10:15 parte la push di riserva.'
        : piano.svegliaGiaScattata
          ? 'Sveglia 8:30 scattata oggi sul telefono (programmata: suona anche a app chiusa). Prova al 100%: non ancora — verde appena il cliente apre l\'app.'
          : 'La sveglia suonerà alle 8:30 (programmata: suona anche a app chiusa). Prova al 100%: non ancora.',
    }
  }
  const prossima = piano.futuri[0] ?? null
  if (piano.passati.length > 0 && prossima) {
    return {
      tono: 'amber',
      lista: '🔔 avviso in corso',
      etichetta: '🔔 Avviso in corso',
      riga: `La prossima sveglia è il ${fmt(prossima.data)} (${etichettaAnticipo(prossima.g)}). Prova al 100%: non ancora.`,
    }
  }
  if (s.notificata === true) {
    return {
      tono: 'amber',
      lista: '⏳ in attesa',
      etichetta: '⏳ In attesa di consegna',
      riga: 'Il giro del check ha già registrato l\'avvio (campanella in app). Prova al 100%: non ancora.',
    }
  }
  return {
    tono: 'grigio',
    lista: '',
    etichetta: 'Non ancora avviata',
    riga: prossima
      ? `Il primo avviso (sveglia 8:30) scatta il ${fmt(prossima.data)} (${etichettaAnticipo(prossima.g)}).`
      : 'La notifica partirà quando la scadenza entra nei giorni di avviso del piano.',
  }
}
