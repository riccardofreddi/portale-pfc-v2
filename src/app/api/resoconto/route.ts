/**
 * /api/resoconto - admin: statistiche archivio per cliente
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { listaOggetti, haConfigurazioneR2, DOCS_PREFIX } from '@/lib/r2'
import { formatBytes } from '@/lib/pfc-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  const clienti = await db.user.findMany({
    where: { role: 'client' },
    orderBy: { name: 'asc' },
  })

  if (!haConfigurazioneR2()) {
    return NextResponse.json({
      r2NotConfigured: true,
      stats: clienti.map((c) => ({ username: c.username, name: c.name, exemptMaintenance: c.exemptMaintenance, nFiles: 0, sizeBytes: 0, sizeStr: '0 B', anni: [] })),
    })
  }

  const stats = await Promise.all(clienti.map(async (c) => {
    const prefix = `${DOCS_PREFIX}/${c.username}/`
    const objs = await listaOggetti(prefix)
    const archiveObjs = objs.filter((o) => !o.key.slice(prefix.length).startsWith('_'))
    const sizeBytes = archiveObjs.reduce((s, o) => s + o.size, 0)

    const annoMap = new Map<string, Map<string, { nFiles: number; sizeBytes: number; files: Array<{ nome: string; key: string; size: number; sizeStr: string }> }>>()
    for (const o of archiveObjs) {
      const rel = o.key.slice(prefix.length)
      const parts = rel.split('/')
      if (parts.length < 3) continue
      const [anno, cartella, ...fileParts] = parts
      const nome = fileParts.join('/')
      if (!nome) continue
      if (!annoMap.has(anno)) annoMap.set(anno, new Map())
      const cartellaMap = annoMap.get(anno)!
      if (!cartellaMap.has(cartella)) cartellaMap.set(cartella, { nFiles: 0, sizeBytes: 0, files: [] })
      const x = cartellaMap.get(cartella)!
      x.nFiles++
      x.sizeBytes += o.size
      x.files.push({ nome, key: o.key, size: o.size, sizeStr: formatBytes(o.size) })
    }

    const anni = Array.from(annoMap.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([anno, cartMap]) => ({
      anno,
      cartelle: Array.from(cartMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([cartella, x]) => ({
        cartella, nFiles: x.nFiles, sizeBytes: x.sizeBytes,
        files: x.files.sort((a, b) => a.nome.localeCompare(b.nome)),
      })),
    }))

    return { username: c.username, name: c.name, exemptMaintenance: c.exemptMaintenance, nFiles: archiveObjs.length, sizeBytes, sizeStr: formatBytes(sizeBytes), anni }
  }))

  return NextResponse.json({ stats })
}
