import { NextRequest, NextResponse } from 'next/server'
import { getSession, logAudit } from '@/lib/auth'
import { caricaBytes, salvaBytes, eliminaOggetto, haConfigurazioneR2 } from '@/lib/r2'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }
  if (!haConfigurazioneR2()) {
    return NextResponse.json({ error: 'R2 non configurato' }, { status: 500 })
  }

  const { keys, moveToTrash = true } = (await req.json().catch(() => ({}))) as {
    keys: string[]
    moveToTrash?: boolean
  }
  if (!Array.isArray(keys) || keys.length === 0) {
    return NextResponse.json({ error: 'Nessuna chiave fornita' }, { status: 400 })
  }

  const results: { key: string; status: 'ok' | 'error' }[] = []
  for (const key of keys) {
    try {
      if (moveToTrash) {
        const trashKey = key.replace(/^Documenti\//, 'Documenti/_cestino/')
        const buf = await caricaBytes(key)
        if (buf) {
          await salvaBytes(trashKey, buf)
          await eliminaOggetto(key)
        }
      } else {
        await eliminaOggetto(key)
      }
      results.push({ key, status: 'ok' })
    } catch (err) {
      console.error('[delete] errore per', key, err)
      results.push({ key, status: 'error' })
    }
  }

  await logAudit(session.sub, 'DELETE_DOC', `${keys.length} file (moveToTrash=${moveToTrash})`)
  return NextResponse.json({ ok: true, results })
}
