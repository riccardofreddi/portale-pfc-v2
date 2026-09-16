import { NextRequest, NextResponse } from 'next/server'
import { getSession, logAudit } from '@/lib/auth'
import { salvaBytes, listaOggetti, eliminaOggetto, caricaBytes, buildCassettoKey, DOCS_PREFIX, ANAGRAFICA_DIR, haConfigurazioneR2 } from '@/lib/r2'
import { sanitizzaNomeFile, DEFAULT_ADMIN_USER } from '@/lib/pfc-utils'
import { sendPushToUser } from '@/lib/push'

export const dynamic = 'force-dynamic'

// v4.53: limite DEDICATO al Cassetto (5MB). Le altre superfici (area documenti,
// risposte ai messaggi) restano al limite generale di 20MB: qui si abbassa
// perche' il cassetto ha uno slot fisso per tipo e non deve mangiare archivio.
const CASSETTO_MAX_FILE_SIZE_MB = 5
const CASSETTO_MAX_FILE_SIZE_BYTES = CASSETTO_MAX_FILE_SIZE_MB * 1024 * 1024
// Budget per l'invio push inline verso lo studio (stesso schema di /api/messaggi).
export const maxDuration = 30

const DOC_EXT_MAP: Record<string, string[]> = {
  'qr_code_p_iva': ['png', 'jpg', 'jpeg', 'svg', 'pdf'],
  'certificato_p_iva': ['pdf', 'jpg', 'jpeg', 'png'],
  'visura_camerale': ['pdf', 'jpg', 'jpeg', 'png'],
  'doc_identita': ['pdf', 'jpg', 'jpeg', 'png'],
  'iban': ['pdf', 'jpg', 'jpeg', 'png', 'txt'],
  'altro': [],
}

const DOC_LABEL_MAP: Record<string, string> = {
  'QR Code P.IVA': 'qr_code_p_iva',
  'Certificato P.IVA': 'certificato_p_iva',
  'Visura Camerale': 'visura_camerale',
  'Doc. Identita': 'doc_identita',
  'Doc. Identità': 'doc_identita',
  'IBAN': 'iban',
  'Altro': 'altro',
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  if (!haConfigurazioneR2()) {
    return NextResponse.json({ error: 'R2 non configurato' }, { status: 500 })
  }

  try {
    const formData = await req.formData()
    const tipoLabel = String(formData.get('tipo') ?? '').trim()
    const file = formData.getAll('file').filter((f): f is File => f instanceof File)[0]

    const url = new URL(req.url)
    const targetUsername = session.role === 'admin'
      ? (url.searchParams.get('username') ?? '').trim().toLowerCase() || session.sub
      : session.sub

    if (!tipoLabel) return NextResponse.json({ error: 'Tipo documento mancante' }, { status: 400 })
    if (!file) return NextResponse.json({ error: 'File mancante' }, { status: 400 })

    const tipoKey = DOC_LABEL_MAP[tipoLabel] ?? 'altro'
    if (tipoKey === 'altro' && session.role !== 'admin') {
      return NextResponse.json({ error: 'Tipo non valido' }, { status: 400 })
    }

    if (file.size > CASSETTO_MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: `File troppo grande (max ${CASSETTO_MAX_FILE_SIZE_MB}MB)` }, { status: 400 })
    }

    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    if (!ext) return NextResponse.json({ error: 'File senza estensione' }, { status: 400 })
    const allowedExts = DOC_EXT_MAP[tipoKey] ?? []
    if (allowedExts.length > 0 && !allowedExts.includes(ext)) {
      return NextResponse.json({
        error: `Per '${tipoLabel}' usa uno di questi formati: ${allowedExts.join(', ')}`,
      }, { status: 400 })
    }

    const anno = new Date().getFullYear()
    const newKey = buildCassettoKey(targetUsername, `${tipoKey}_${anno}.${ext}`)

    const existingPrefix = `${DOCS_PREFIX}/${targetUsername}/${ANAGRAFICA_DIR}/`
    const existing = await listaOggetti(existingPrefix)
    const existingNames = new Set(existing.map((o) => o.key.slice(existingPrefix.length)))

    // v4.53: regola "uno slot per tipo": ogni cliente ha UN solo documento per
    // tipo (QR Code, IBAN, ecc.). Il riconoscimento usa il PREFISSO del tipo
    // nella chiave ({tipoKey}_...), quindi copre anche i file caricati prima
    // di questa regola; e rinominare (che da questa versione conserva il
    // prefisso) non libera piu' lo slot. Il blocco sta qui sul server perche'
    // e' l'unico posto sicuro: l'app e il web nascondono/spengono i tipi gia'
    // pieni ma sono solo comodita' visiva. 'Altro' resta senza limite perche'
    // e' raggiungibile solo dall'admin.
    if (tipoKey !== 'altro') {
      const occupato = existing.find((o) => o.key.slice(existingPrefix.length).startsWith(`${tipoKey}_`))
      if (occupato) {
        return NextResponse.json(
          { error: `Hai già caricato "${tipoLabel}". Per ricaricarlo, cancella prima quello esistente.` },
          { status: 409 },
        )
      }
    }

    if (existingNames.has(`${tipoKey}_${anno}.${ext}`)) {
      const trashKey = newKey.replace(/^Documenti\//, 'Documenti/_cestino/')
      const oldData = await caricaBytes(newKey)
      if (oldData) {
        await salvaBytes(trashKey, oldData)
      }
    }

    const buf = Buffer.from(await file.arrayBuffer())
    await salvaBytes(newKey, buf)

    // Squillo per lo studio SOLO quando a caricare e' il cliente (le sue carte
    // d'identita', IBAN, ecc.). Se carica l'admin, nessuna notifica. Try/catch:
    // un problema di push non deve mai far fallire il caricamento.
    if (session.role === 'client') {
      try {
        await sendPushToUser(DEFAULT_ADMIN_USER, {
          title: 'Documento nel Cassetto',
          body: `${session.sub}: ha caricato "${tipoLabel}" (${tipoKey}_${anno}.${ext})`.slice(0, 100),
          url: '/?tab=clienti',
          tag: 'pfc-cassetto-cliente',
        })
      } catch (pushErr) {
        console.error('[cassetto/upload] push admin (ignorata):', pushErr)
      }
    }

    await logAudit(session.sub, 'UPLOAD_CASSETTO', `${tipoKey}_${anno}.${ext} (${tipoLabel})`)
    return NextResponse.json({ ok: true, key: newKey, nome: `${tipoKey}_${anno}.${ext}` })
  } catch (err) {
    console.error('[cassetto/upload] errore:', err)
    return NextResponse.json({ error: `Errore: ${String(err)}` }, { status: 500 })
  }
}
