import { NextRequest, NextResponse } from 'next/server'
import { getSession, logAudit } from '@/lib/auth'
import { salvaBytes, listaOggetti, eliminaOggetto, caricaBytes, buildCassettoKey, DOCS_PREFIX, ANAGRAFICA_DIR, haConfigurazioneR2 } from '@/lib/r2'
import { sanitizzaNomeFile, MAX_FILE_SIZE_BYTES } from '@/lib/pfc-utils'

export const dynamic = 'force-dynamic'

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

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: `File troppo grande (max ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB)` }, { status: 400 })
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
    if (existingNames.has(`${tipoKey}_${anno}.${ext}`)) {
      const trashKey = newKey.replace(/^Documenti\//, 'Documenti/_cestino/')
      const oldData = await caricaBytes(newKey)
      if (oldData) {
        await salvaBytes(trashKey, oldData)
      }
    }

    const buf = Buffer.from(await file.arrayBuffer())
    await salvaBytes(newKey, buf)

    await logAudit(session.sub, 'UPLOAD_CASSETTO', `${tipoKey}_${anno}.${ext} (${tipoLabel})`)
    return NextResponse.json({ ok: true, key: newKey, nome: `${tipoKey}_${anno}.${ext}` })
  } catch (err) {
    console.error('[cassetto/upload] errore:', err)
    return NextResponse.json({ error: `Errore: ${String(err)}` }, { status: 500 })
  }
}
