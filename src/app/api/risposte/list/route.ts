/**
 * /api/risposte/list
 * GET - admin: elenca tutti i file ricevuti dai clienti (in _risposte/)
 *
 * Struttura R2: Documenti/{username}/_risposte/{msg_id}/{filename}
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { listaOggetti, haConfigurazioneR2, DOCS_PREFIX, formatBytes } from '@/lib/r2'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  if (!haConfigurazioneR2()) {
    return NextResponse.json({ files: [] })
  }

  // Tutti i clienti
  const clienti = await db.user.findMany({
    where: { role: 'client' },
    orderBy: { name: 'asc' },
  })

  // Per ogni cliente, lista i file in _risposte/ (in parallelo)
  const results = await Promise.all(
    clienti.map(async (c) => {
      const prefix = `${DOCS_PREFIX}/${c.username}/_risposte/`
      const objs = await listaOggetti(prefix).catch(() => [])
      return objs.map((o) => {
        const rel = o.key.slice(prefix.length) // es. "msg_abc123/filename.pdf"
        const parts = rel.split('/')
        const msgId = parts.length > 1 ? parts[0] : ''
        const nome = parts.length > 1 ? parts.slice(1).join('/') : rel
        return {
          key: o.key,
          nome,
          msgId,
          username: c.username,
          clienteNome: c.name,
          size: o.size,
          sizeStr: formatBytes(o.size),
          lastModified: o.lastModified,
        }
      })
    })
  )

  // Unisci e ordina per data (piu' recente prima)
  const files = results
    .flat()
    .sort((a, b) => {
      const ta = a.lastModified?.getTime() ?? 0
      const tb = b.lastModified?.getTime() ?? 0
      return tb - ta
    })

  return NextResponse.json({ files })
}
