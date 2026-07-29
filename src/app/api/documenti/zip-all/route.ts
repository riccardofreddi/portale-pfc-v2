/**
 * /api/documenti/zip-all
 * GET - admin: scarica tutti i documenti di tutti i clienti in un unico ZIP
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, logAudit } from '@/lib/auth'
import { listaOggetti, caricaBytes, haConfigurazioneR2, DOCS_PREFIX } from '@/lib/r2'
import { ZipArchive } from 'archiver'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  if (!haConfigurazioneR2()) {
    return NextResponse.json({ error: 'R2 non configurato' }, { status: 500 })
  }

  try {
    // Tutti i clienti
    const clienti = await db.user.findMany({
      where: { role: 'client' },
      orderBy: { name: 'asc' },
    })

    // Raccogli tutti i file in parallelo
    const allFiles = await Promise.all(
      clienti.map(async (c) => {
        const prefix = `${DOCS_PREFIX}/${c.username}/`
        const objs = await listaOggetti(prefix)
        return objs
          .filter((o) => !o.key.slice(prefix.length).startsWith('_'))
          .map((o) => ({
            key: o.key,
            username: c.username,
            clienteNome: c.name,
            relPath: o.key.slice(prefix.length),
          }))
      })
    )
    const files = allFiles.flat()

    if (files.length === 0) {
      return NextResponse.json({ error: 'Nessun documento da scaricare' }, { status: 400 })
    }

    // Crea ZIP
    const archive = new ZipArchive({ zlib: { level: 5 } })
    const chunks: Buffer[] = []
    archive.on('data', (c: Buffer) => chunks.push(c))
    archive.on('warning', (err: unknown) => console.warn('[zip-all] warning:', err))

    const finished = new Promise<void>((resolve, reject) => {
      archive.on('end', resolve)
      archive.on('error', reject)
    })

    // Aggiungi file allo ZIP (organizzati per cliente)
    for (const f of files) {
      const buf = await caricaBytes(f.key)
      if (buf) {
        // Path nello ZIP: Cliente/anno/cartella/file
        const safeName = f.clienteNome.replace(/[<>:"/\\|?*]/g, '_')
        const zipPath = `${safeName}/${f.relPath}`
        archive.append(buf, { name: zipPath })
      }
    }

    archive.finalize()
    await finished

    const zipBuf = Buffer.concat(chunks)
    const finalName = `backup_completo_${new Date().toISOString().slice(0, 10)}.zip`

    await logAudit(session.sub, 'BACKUP_COMPLETO', `${files.length} file, ${zipBuf.length} bytes`)

    return new NextResponse(new Uint8Array(zipBuf), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(finalName)}`,
        'Content-Length': String(zipBuf.length),
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch (err) {
    console.error('[zip-all] errore:', err)
    return NextResponse.json({ error: 'Errore creazione ZIP: ' + String(err) }, { status: 500 })
  }
}
