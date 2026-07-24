import { NextRequest, NextResponse } from 'next/server'
import { getSession, logAudit } from '@/lib/auth'
import { eliminaOggetto, haConfigurazioneR2, DOCS_PREFIX, ANAGRAFICA_DIR } from '@/lib/r2'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  if (!haConfigurazioneR2()) {
    return NextResponse.json({ error: 'R2 non configurato' }, { status: 500 })
  }

  try {
    const { key } = await req.json().catch(() => ({}))
    if (!key || !key.startsWith(`${DOCS_PREFIX}/`) || !key.includes(`/${ANAGRAFICA_DIR}/`)) {
      return NextResponse.json({ error: 'Key non valida' }, { status: 400 })
    }

    if (session.role === 'client') {
      const expectedPrefix = `${DOCS_PREFIX}/${session.sub}/${ANAGRAFICA_DIR}/`
      if (!key.startsWith(expectedPrefix)) {
        return NextResponse.json({ error: 'Non autorizzato per questo file' }, { status: 403 })
      }
    }

    // Elimina definitivamente (NON sposta nel cestino)
    await eliminaOggetto(key)

    await logAudit(session.sub, 'ELIMINA_FILE_CASSETTO', key)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[cassetto/delete] errore:', err)
    return NextResponse.json({ error: `Errore: ${String(err)}` }, { status: 500 })
  }
}
