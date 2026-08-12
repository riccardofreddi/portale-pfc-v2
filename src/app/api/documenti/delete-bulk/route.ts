/**
 * /api/documenti/delete-bulk
 * POST - admin: elimina anno intero o cartella intera (sposta nel cestino)
 * Body: { username, anno, cartella? }
 *   - Senza cartella: elimina TUTTO l'anno
 *   - Con cartella: elimina solo quella cartella
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession, logAudit } from '@/lib/auth'
import { db } from '@/lib/db'
import { listaOggetti, caricaBytes, salvaBytes, eliminaOggetto, haConfigurazioneR2, DOCS_PREFIX } from '@/lib/r2'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  if (!haConfigurazioneR2()) {
    return NextResponse.json({ error: 'R2 non configurato' }, { status: 500 })
  }

  try {
    const { username, anno, cartella } = await req.json().catch(() => ({})) as {
      username: string
      anno: string
      cartella?: string
    }

    if (!username || !anno) {
      return NextResponse.json({ error: 'Username e anno obbligatori' }, { status: 400 })
    }

    // Lista tutti i file del cliente per quell'anno (e cartella se specificata)
    const prefix = cartella
      ? `${DOCS_PREFIX}/${username}/${anno}/${cartella}/`
      : `${DOCS_PREFIX}/${username}/${anno}/`

    const objs = await listaOggetti(prefix)

    if (objs.length === 0) {
      return NextResponse.json({ ok: true, deleted: 0, message: 'Nessun file da eliminare' })
    }

    // Sposta nel cestino (batch da 10 in parallelo)
    const BATCH_SIZE = 10
    let deleted = 0
    for (let i = 0; i < objs.length; i += BATCH_SIZE) {
      const batch = objs.slice(i, i + BATCH_SIZE)
      await Promise.all(
        batch.map(async (o) => {
          try {
            const trashKey = o.key.replace(/^Documenti\//, 'Documenti/_cestino/')
            const buf = await caricaBytes(o.key)
            if (buf) {
              await salvaBytes(trashKey, buf)
              await eliminaOggetto(o.key)
              deleted++
            }
          } catch (err) {
            console.error('[delete-bulk] errore', o.key, err)
          }
        })
      )
    }

    // Rimuovi le eventuali scadenze collegate ai file eliminati.
    await db.scadenza.deleteMany({ where: { filePath: { in: objs.map(o => o.key) } } }).catch(() => {})

    const target = cartella ? `cartella ${cartella}` : `anno ${anno}`
    await logAudit(session.sub, 'DELETE_BULK', `${username} - ${target} (${deleted} file)`)

    return NextResponse.json({ ok: true, deleted })
  } catch (err) {
    console.error('[delete-bulk] errore:', err)
    return NextResponse.json({ error: 'Errore: ' + String(err) }, { status: 500 })
  }
}
