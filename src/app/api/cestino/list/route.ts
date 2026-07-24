import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { listaOggetti, haConfigurazioneR2, DOCS_PREFIX } from '@/lib/r2'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  if (!haConfigurazioneR2()) {
    return NextResponse.json({ error: 'R2 non configurato' }, { status: 500 })
  }

  try {
    const prefix = `${DOCS_PREFIX}/_cestino/`
    const objs = await listaOggetti(prefix)

    const files = objs
      .filter((o) => {
        // Filtra file di sistema
        const name = o.key.split('/').pop() ?? ''
        if (name.startsWith('.')) return false
        if (o.key.includes('/.metadata/')) return false
        return true
      })
      .map((o) => {
        const rel = o.key.slice(prefix.length)
        const parts = rel.split('/')
        const username = parts[0] ?? ''
        const anno = parts[1] ?? ''
        const cartella = parts[2] ?? ''
        const nome = parts.slice(3).join('/') || ''
        const originalKey = `${DOCS_PREFIX}/${rel}`

        return {
          key: o.key, nome, username, anno, cartella, originalKey,
          size: o.size, sizeStr: formatBytesLocal(o.size), lastModified: o.lastModified,
        }
      })

    return NextResponse.json({ files })
  } catch (err) {
    console.error('[cestino/list] errore:', err)
    return NextResponse.json({ error: `Errore: ${String(err)}` }, { status: 500 })
  }
}

function formatBytesLocal(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const v = bytes / Math.pow(1024, i)
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
