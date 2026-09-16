import { NextRequest, NextResponse } from 'next/server'
import { getSession, logAudit } from '@/lib/auth'
import { caricaBytes, salvaBytes, eliminaOggetto, haConfigurazioneR2, DOCS_PREFIX, ANAGRAFICA_DIR } from '@/lib/r2'
import { sanitizzaNomeFile } from '@/lib/pfc-utils'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  if (!haConfigurazioneR2()) {
    return NextResponse.json({ error: 'R2 non configurato' }, { status: 500 })
  }

  try {
    const { key, newName } = await req.json().catch(() => ({}))
    if (!key || !key.startsWith(`${DOCS_PREFIX}/`) || !key.includes(`/${ANAGRAFICA_DIR}/`)) {
      return NextResponse.json({ error: 'Key non valida' }, { status: 400 })
    }
    if (!newName) return NextResponse.json({ error: 'Nuovo nome mancante' }, { status: 400 })

    if (session.role === 'client') {
      const expectedPrefix = `${DOCS_PREFIX}/${session.sub}/${ANAGRAFICA_DIR}/`
      if (!key.startsWith(expectedPrefix)) {
        return NextResponse.json({ error: 'Non autorizzato per questo file' }, { status: 403 })
      }
    }

    const ext = key.split('.').pop() ?? ''
    const baseName = sanitizzaNomeFile(String(newName).trim()).replace(/\.[^.]+$/, '')
    if (!baseName) return NextResponse.json({ error: 'Nome non valido' }, { status: 400 })

    const oldFileName = key.split('/').pop() ?? ''

    // v4.53: nel Cassetto il tipo resta inciso nella chiave anche rinominando:
    // {tipoKey}_{anno}_{nuovonome}.{ext}. Rinominare NON libera piu' lo slot:
    // il tipo resta occupato finche' il file non si cancella (regola
    // "uno slot per tipo"). File senza prefisso riconoscibile (caricati e
    // rinominati prima di questa versione) si rinominano come prima.
    const matchTipo = oldFileName.match(
      /^(qr_code_p_iva|certificato_p_iva|visura_camerale|doc_identita|iban|altro)_(\d{4})(?:_.*)?\.[^.]+$/,
    )
    let finalName = ext ? `${baseName}.${ext}` : baseName
    if (matchTipo) {
      finalName = `${matchTipo[1]}_${matchTipo[2]}_${baseName}${ext ? `.${ext}` : ''}`
    }

    const newKey = key.slice(0, key.length - oldFileName.length) + finalName

    if (newKey === key) {
      return NextResponse.json({ error: 'Il nuovo nome è uguale al vecchio' }, { status: 400 })
    }

    const buf = await caricaBytes(key)
    if (!buf) return NextResponse.json({ error: 'File non trovato su R2' }, { status: 404 })
    await salvaBytes(newKey, buf)
    await eliminaOggetto(key)

    await logAudit(session.sub, 'RINOMINA_FILE', `${key} -> ${newKey}`)
    return NextResponse.json({ ok: true, newKey, newName: finalName })
  } catch (err) {
    console.error('[cassetto/rename] errore:', err)
    return NextResponse.json({ error: `Errore: ${String(err)}` }, { status: 500 })
  }
}
