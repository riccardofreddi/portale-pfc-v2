/**
 * /api/documenti/list
 * GET ?username=...&anno=...&cartella=...
 */
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
      error: 'R2 non configurato. Imposta le variabili d\'ambiente R2_*.',
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

      // Cliente: prendi userId UNA VOLTA SOLA, poi query parallele
      if (session.role === 'client') {
        const user = await db.user.findUnique({ where: { username: session.sub } })
        if (!user) return NextResponse.json({ cartelle: [] })

        // Query DB parallele per tutti i file della cartella dell'anno
        const [dls, views] = await Promise.all([
          db.fileDownload.findMany({ where: { userId: user.id } }),
          db.fileView.findMany({ where: { userId: user.id } }),
        ])
        const scaricati = new Set(dls.map((d) => d.filePath))
        const visti = new Set(views.map((v) => v.filePath))

        // Carica i file di TUTTE le cartelle in parallelo (non sequenziale)
        const cartelleWithData = await Promise.all(
          cartelle.map(c => listFilesInCartella(username, anno, c).then(files => ({ c, files })))
        )

        const cartelleWithMeta = cartelleWithData.map(({ c, files }) => {
          const nNuovi = files.filter((f) => !scaricati.has(f.key) && !visti.has(f.key)).length
          return { nome: c, nFiles: files.length, nNuovi }
        })

        return NextResponse.json({ cartelle: cartelleWithMeta })
      }

      // Admin: stessa cosa, carica tutte le cartelle in parallelo
      const cartelleWithData = await Promise.all(
        cartelle.map(c => listFilesInCartella(username, anno, c).then(files => ({ c, files })))
      )
      const cartelleWithMeta = cartelleWithData.map(({ c, files }) => ({
        nome: c, nFiles: files.length, nNuovi: 0
      }))
      return NextResponse.json({ cartelle: cartelleWithMeta })
    }

    const files = await listFilesInCartella(username, anno, cartella)

    // Cliente: prendi userId UNA VOLTA SOLA, poi 3 query parallele
    if (session.role === 'client') {
      const user = await db.user.findUnique({ where: { username: session.sub } })
      if (user) {
        const [prefs, dls, views] = await Promise.all([
          db.favorite.findMany({ where: { userId: user.id } }),
          db.fileDownload.findMany({ where: { userId: user.id } }),
          db.fileView.findMany({ where: { userId: user.id } }),
        ])
        const preferiti = new Set(prefs.map((p) => p.filePath))
        const scaricati = new Set(dls.map((d) => d.filePath))
        const visti = new Set(views.map((v) => v.filePath))

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
        // Arricchisci con data caricamento effettiva (UploadDate)
    const uploadDates = await db.uploadDate.findMany({ where: { filePath: { in: files.map(f => f.key) } } })
    const uploadDateMap = new Map(uploadDates.map(u => [u.filePath, u.ts]))
    const scadenze = await db.scadenza.findMany({ where: { filePath: { in: files.map(f => f.key) } } })
    const scadenzaMap = new Map(scadenze.map(s => [s.filePath, s]))
    const enrichedWithDate = enriched.map(f => ({
      ...f,
      uploadDate: uploadDateMap.get(f.key) || null,
      scadenza: scadenzaMap.has(f.key)
        ? {
            id: scadenzaMap.get(f.key)!.id,
            titolo: scadenzaMap.get(f.key)!.titolo,
            dataScadenza: scadenzaMap.get(f.key)!.dataScadenza,
            anticipoGiorni: scadenzaMap.get(f.key)!.anticipoGiorni,
            pagata: scadenzaMap.get(f.key)!.pagata,
          }
        : null,
    }))
    return NextResponse.json({ files: enrichedWithDate })
      }
    }

    // Admin o cliente senza user: ritorna file semplici
    // Arricchisci con data caricamento effettiva (UploadDate) - admin
    const uploadDatesAdmin = await db.uploadDate.findMany({ where: { filePath: { in: files.map(f => f.key) } } })
    const uploadDateMapAdmin = new Map(uploadDatesAdmin.map(u => [u.filePath, u.ts]))
    const scadenzeAdmin = await db.scadenza.findMany({ where: { filePath: { in: files.map(f => f.key) } } })
    const scadenzaMapAdmin = new Map(scadenzeAdmin.map(s => [s.filePath, s]))
    const filesWithDate = files.map(f => ({
      ...f,
      uploadDate: uploadDateMapAdmin.get(f.key) || null,
      scadenza: scadenzaMapAdmin.has(f.key)
        ? {
            id: scadenzaMapAdmin.get(f.key)!.id,
            titolo: scadenzaMapAdmin.get(f.key)!.titolo,
            dataScadenza: scadenzaMapAdmin.get(f.key)!.dataScadenza,
            anticipoGiorni: scadenzaMapAdmin.get(f.key)!.anticipoGiorni,
            pagata: scadenzaMapAdmin.get(f.key)!.pagata,
          }
        : null,
    }))
    return NextResponse.json({ files: filesWithDate })
  } catch (err) {
    console.error('[documenti/list] errore:', err)
    return NextResponse.json({ error: 'Errore recupero documenti' }, { status: 500 })
  }
}
