/**
 * /api/documenti/rename
 * POST - admin: rinomina un file su R2 (copia + elimina)
 * Body: { key: string, newName: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession, logAudit } from '@/lib/auth'
import { caricaBytes, salvaBytes, eliminaOggetto, haConfigurazioneR2, purificaRiferimentiDB } from '@/lib/r2'
import { sanitizzaNomeFile } from '@/lib/pfc-utils'

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
    const { key, newName } = await req.json().catch(() => ({})) as { key: string; newName: string }

    if (!key || !newName) {
      return NextResponse.json({ error: 'Key e newName obbligatori' }, { status: 400 })
    }

    const sanitized = sanitizzaNomeFile(newName)
    if (!sanitized || sanitized === '.') {
      return NextResponse.json({ error: 'Nome file non valido' }, { status: 400 })
    }

    // Calcola la nuova key (stessa cartella, nuovo nome)
    const parts = key.split('/')
    const oldName = parts[parts.length - 1]
    const dir = parts.slice(0, -1).join('/')
    const newKey = `${dir}/${sanitized}`

    if (key === newKey) {
      return NextResponse.json({ error: 'Il nuovo nome è uguale al vecchio' }, { status: 400 })
    }

    // Carica il file
    const buf = await caricaBytes(key)
    if (!buf) {
      return NextResponse.json({ error: 'File non trovato su R2' }, { status: 404 })
    }

    // Salva con nuovo nome
    await salvaBytes(newKey, buf)

    // Elimina il vecchio file
    await eliminaOggetto(key)

    // Pulisci riferimenti DB orfani per il vecchio path
    await purificaRiferimentiDB(key)

    await 

    return NextResponse.json({ ok: true, newKey, newName: sanitized })
  } catch (err) {
    console.error('[rename] errore:', err)
    return NextResponse.json({ error: 'Errore: ' + String(err) }, { status: 500 })
  }
}
