import { NextRequest, NextResponse } from 'next/server'
import { getSession, logAudit } from '@/lib/auth'
import { eliminaOggetto, listaOggetti, haConfigurazioneR2, DOCS_PREFIX } from '@/lib/r2'

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
    const body = await req.json().catch(() => ({}))
    const keys: string[] = body.keys ?? (body.key ? [body.key] : [])

    // Se non ci sono keys specificate e deleteAll=true, elimina tutto il cestino
    if (keys.length === 0 && body.deleteAll === true) {
      const prefix = `${DOCS_PREFIX}/_cestino/`
      const allObjs = await listaOggetti(prefix)
      // Filtra file di sistema (.registro_cestino.json, .metadata)
      const toDelete = allObjs.filter((o) => {
        const name = o.key.split('/').pop() ?? ''
        if (name.startsWith('.')) return false
        if (o.key.includes('/.metadata/')) return false
        return true
      })
      let deleted = 0
      for (const o of toDelete) {
        try { await eliminaOggetto(o.key); deleted++ } catch {}
      }
      await logAudit(session.sub, 'SVUOTA_CESTINO', `${deleted} file eliminati definitivamente`)
      return NextResponse.json({ ok: true, deleted })
    }

    // Eliminazione selettiva (singolo o multipla)
    if (keys.length === 0) {
      return NextResponse.json({ error: 'Nessuna key fornita' }, { status: 400 })
    }

    let deleted = 0
    for (const key of keys) {
      if (!key.startsWith(`${DOCS_PREFIX}/_cestino/`)) continue
      try { await eliminaOggetto(key); deleted++ } catch {}
    }

    await logAudit(session.sub, 'ELIMINA_DEFINITIVO_CESTINO', `${deleted} file eliminati`)
    return NextResponse.json({ ok: true, deleted })
  } catch (err) {
    console.error('[cestino/delete-permanent] errore:', err)
    return NextResponse.json({ error: `Errore: ${String(err)}` }, { status: 500 })
  }
}
