import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { listaOggetti, haConfigurazioneR2, DOCS_PREFIX } from '@/lib/r2'

export const dynamic = 'force-dynamic'

function normalizzaTesto(testo: string): string[] {
  if (!testo) return []
  let t = testo.toLowerCase().trim()
  for (const sep of ['_', '-', '.', '/', '\\', '(', ')', '[', ']']) {
    t = t.split(sep).join(' ')
  }
  return t.split(/\s+/).filter(Boolean)
}

function fuzzyMatch(queryTokens: string[], targetTokens: string[]): boolean {
  if (!queryTokens) return false
  for (const qt of queryTokens) {
    let trovato = false
    for (const tt of targetTokens) {
      if (tt.includes(qt)) { trovato = true; break }
    }
    if (!trovato) return false
  }
  return true
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  if (!haConfigurazioneR2()) {
    return NextResponse.json({ error: 'R2 non configurato' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim().toLowerCase()
  let username = (searchParams.get('username') ?? '').trim().toLowerCase()

  if (session.role === 'client') username = session.sub
  if (!username) return NextResponse.json({ error: 'Username mancante' }, { status: 400 })

  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const queryTokens = normalizzaTesto(q)
  if (!queryTokens.length) {
    return NextResponse.json({ results: [] })
  }

  const prefix = `${DOCS_PREFIX}/${username}/`
  const objs = await listaOggetti(prefix)

  // Per cliente: carica stato (visto/scaricato) per arricchire risultati
  let scaricati = new Set<string>()
  let visti = new Set<string>()
  let preferiti = new Set<string>()
  if (session.role === 'client') {
    const user = await db.user.findUnique({ where: { username: session.sub } })
    if (user) {
      const [dls, views, prefs] = await Promise.all([
        db.fileDownload.findMany({ where: { userId: user.id } }),
        db.fileView.findMany({ where: { userId: user.id } }),
        db.favorite.findMany({ where: { userId: user.id } }),
      ])
      scaricati = new Set(dls.map((d) => d.filePath))
      visti = new Set(views.map((v) => v.filePath))
      preferiti = new Set(prefs.map((p) => p.filePath))
    }
  }

  const risultati: Array<{
    nome: string; key: string; anno: string; cartella: string;
    size: number; sizeStr: string; score: number;
    stato: 'preferito' | 'nuovo' | 'visto' | 'scaricato'; isPreferito: boolean;
  }> = []

  for (const o of objs) {
    const rel = o.key.slice(prefix.length)
    if (rel.startsWith('_')) continue

    const parts = rel.split('/')
    if (parts.length < 3) continue

    const [anno, cartella, ...fileParts] = parts
    const file = fileParts.join('/')
    if (!file) continue

    const fileTokens = normalizzaTesto(file)
    const cartellaTokens = normalizzaTesto(cartella)
    const annoTokens = normalizzaTesto(anno)
    const allTargetTokens = [...fileTokens, ...cartellaTokens, ...annoTokens]

    if (!fuzzyMatch(queryTokens, allTargetTokens)) continue

    let score = 0
    for (const qt of queryTokens) {
      if (fileTokens.some((t) => t.includes(qt))) score += 3
      if (cartellaTokens.some((t) => t.includes(qt))) score += 2
      if (annoTokens.some((t) => t.includes(qt))) score += 1
      if (fileTokens.length > 0 && fileTokens[0].includes(qt)) score += 2
    }

    // Calcola stato (come archivio normale)
    const stato = preferiti.has(o.key)
      ? 'preferito'
      : scaricati.has(o.key)
        ? 'scaricato'
        : visti.has(o.key)
          ? 'visto'
          : 'nuovo'

    risultati.push({
      nome: file, key: o.key, anno, cartella,
      size: o.size, sizeStr: formatBytesLocal(o.size), score,
      stato, isPreferito: preferiti.has(o.key),
    })

    if (risultati.length >= 50) break
  }

  risultati.sort((a, b) => b.score - a.score)

  return NextResponse.json({ results: risultati })
}

function formatBytesLocal(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const v = bytes / Math.pow(1024, i)
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
