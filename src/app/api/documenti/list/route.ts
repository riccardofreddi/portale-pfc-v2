import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { listAnniForCliente, listCartelleForAnno, listFilesInCartella, haConfigurazioneR2 } from '@/lib/r2'
import { DEFAULT_ADMIN_USER } from '@/lib/pfc-utils'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  let username = searchParams.get('username') ?? ''
  const anno = searchParams.get('anno') ?? ''
  const cartella = searchParams.get('cartella') ?? ''

  if (session.role === 'client') {
    username = session.sub
  }
  if (!username) return NextResponse.json({ error: 'Username mancante' }, { status: 400 })

  if (username === DEFAULT_ADMIN_USER && session.role === 'client') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  if (!haConfigurazioneR2()) {
    return NextResponse.json({
      error: 'R2 non configurato.',
      r2NotConfigured: true,
    })
  }

  try {
    if (!anno) {
      const anni = await listAnniForCliente(username)
      return NextResponse.json({ anni })
    }
    if (!cartella) {
      const cartelle = await listCartelleForAnno(username, anno)
      return NextResponse.json({ cartelle })
    }

    const files = await listFilesInCartella(username, anno, cartella)
    let preferiti = new Set<string>()
    let scaricati = new Set<string>()
    let visti = new Set<string>()
    if (session.role === 'client') {
      const user = await db.user.findUnique({ where: { username: session.sub } })
      if (user) {
        const [prefs, dls, views] = await Promise.all([
          db.favorite.findMany({ where: { userId: user.id } }),
          db.fileDownload.findMany({ where: { userId: user.id } }),
          db.fileView.findMany({ where: { userId: user.id } }),
        ])
        preferiti = new Set(prefs.map((p) => p.filePath))
        scaricati = new Set(dls.map((d) => d.filePath))
        visti = new Set(views.map((v) => v.filePath))
      }
    }

    const enriched = files.map((f) => {
      const stato = preferiti.has(f.key)
        ? 'preferito'
        : scaricati.has(f.key)
          ? 'scaricato'
          : visti.has(f.key)
            ? 'visto'
            : 'nuovo'
      return { ...f, stato, isPreferito: preferiti.has(f.key) }
    })
    enriched.sort((a, b) => {
      const order = ['preferito', 'nuovo', 'visto', 'scaricato']
      const oa = order.indexOf(a.stato)
      const ob = order.indexOf(b.stato)
      if (oa !== ob) return oa - ob
      return a.nome.localeCompare(b.nome)
    })

    return NextResponse.json({ files: enriched })
  } catch (err) {
    console.error('[documenti/list] errore:', err)
    return NextResponse.json({ error: 'Errore recupero documenti' }, { status: 500 })
  }
}
