import { NextRequest, NextResponse } from 'next/server'
import { getSession, logAudit } from '@/lib/auth'
import { eliminaOggetto, haConfigurazioneR2, DOCS_PREFIX } from '@/lib/r2'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  if (!haConfigurazioneR2()) {
    return NextResponse.json({ error: 'R2 non configurato' }, { status: 500 })
  }

  try {
    const { key } = await req.json().catch(() => ({}))
    if (!key || !key.startsWith(`${DOCS_PREFIX}/_cestino/`)) {
      return NextResponse.json({ error: 'Key non valida' }, { status: 400 })
    }

    await eliminaOggetto(key)

    await logAudit(session.sub, 'ELIMINA_DEFINITIVO_CESTINO', key)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[cestino/delete-permanent] errore:', err)
    return NextResponse.json({ error: `Errore: ${String(err)}` }, { status: 500 })
  }
}
