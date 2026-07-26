/**
 * /api/cestino/empty
 * POST - admin: svuota completamente il cestino (eliminazione parallela)
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, logAudit } from '@/lib/auth'
import { listaOggetti, eliminaOggetto, DOCS_PREFIX } from '@/lib/r2'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  try {
    // Lista tutti i file nel cestino
    const prefix = `${DOCS_PREFIX}/_cestino/`
    const objs = await listaOggetti(prefix)

    if (objs.length === 0) {
      return NextResponse.json({ ok: true, deleted: 0, message: 'Cestino gia vuoto' })
    }

    // Elimina in parallelo (batch da 10 per non sovraccaricare R2)
    const BATCH_SIZE = 10
    let deleted = 0
    for (let i = 0; i < objs.length; i += BATCH_SIZE) {
      const batch = objs.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(async (o) => {
          try {
            await eliminaOggetto(o.key)
            deleted++
          } catch (err) {
            console.error('[cestino/empty] errore eliminazione', o.key, err)
          }
        })
      )
    }

    // Pulizia riferimenti DB orfani (file_views, file_downloads, favorites, notifications)
    // Nota: i path nel cestino non sono piu' validi, puliamo solo i record che puntano a path nel cestino
    await db.fileView.deleteMany({ where: { filePath: { startsWith: prefix } } }).catch(() => {})
    await db.fileDownload.deleteMany({ where: { filePath: { startsWith: prefix } } }).catch(() => {})
    await db.favorite.deleteMany({ where: { filePath: { startsWith: prefix } } }).catch(() => {})

    await logAudit(session.sub, 'SVUOTA_CESTINO', `${deleted} file eliminati definitivamente`)

    return NextResponse.json({ ok: true, deleted })
  } catch (err) {
    console.error('[cestino/empty] errore:', err)
    return NextResponse.json({ error: 'Errore svuotamento cestino: ' + String(err) }, { status: 500 })
  }
}
