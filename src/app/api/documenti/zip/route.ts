/**
 * /api/documenti/zip
 * POST { keys: string[], zipName: string }
 * Ritorna uno ZIP contenente i file specificati.
 *
 * archiver 8.x e' ESM puro: esporta { Archiver, ZipArchive, TarArchive, JsonArchive }
 * Per creare uno ZIP usiamo: new ZipArchive(options)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession, logAudit } from '@/lib/auth'
import { db } from '@/lib/db'
import { caricaBytes, haConfigurazioneR2, DOCS_PREFIX } from '@/lib/r2'
import { segnaNotificheDocumentoLette } from '@/lib/push'
import { ZipArchive } from 'archiver'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  if (!haConfigurazioneR2()) {
    return NextResponse.json({ error: 'R2 non configurato' }, { status: 500 })
  }

  const { keys, zipName } = (await req.json().catch(() => ({}))) as {
    keys: string[]
    zipName?: string
  }
  if (!Array.isArray(keys) || keys.length === 0) {
    return NextResponse.json({ error: 'Nessuna chiave fornita' }, { status: 400 })
  }

  // Authorization
  for (const key of keys) {
    if (!key.startsWith(`${DOCS_PREFIX}/`)) {
      return NextResponse.json({ error: 'Path non valido' }, { status: 400 })
    }
    if (session.role === 'client') {
      const expectedPrefix = `${DOCS_PREFIX}/${session.sub}/`
      if (!key.startsWith(expectedPrefix)) {
        return NextResponse.json({ error: 'Non autorizzato per uno o piu file' }, { status: 403 })
      }
    }
  }

  try {
    const archive = new ZipArchive({ zlib: { level: 5 } })
    const chunks: Buffer[] = []

    archive.on('data', (c: Buffer) => chunks.push(c))
    archive.on('warning', (err: unknown) => console.warn('[zip] warning:', err))

    const finished = new Promise<void>((resolve, reject) => {
      archive.on('end', resolve)
      archive.on('error', reject)
    })

    for (const key of keys) {
      const buf = await caricaBytes(key)
      if (buf) {
        const nome = key.split('/').pop() ?? 'file'
        archive.append(buf, { name: nome })
      }
    }

    archive.finalize()
    await finished

    const zipBuf = Buffer.concat(chunks)
    const finalName = zipName ?? 'archivio.zip'

    if (session.role === 'client') {
      await logAudit(session.sub, 'SCARICA_ARCHIVIO', `${finalName} (${keys.length} file)`)
      // Il download ZIP conta come download dei singoli file: registra i record
      // di "scaricato" (pallino verde + badge cartella) e segna lette le notifiche
      // documento_nuovo delle cartelle coinvolte.
      const user = await db.user.findUnique({ where: { username: session.sub } })
      if (user) {
        const now = new Date()
        for (const key of keys) {
          await db.fileDownload.upsert({
            where: { userId_filePath: { userId: user.id, filePath: key } },
            create: { userId: user.id, filePath: key },
            update: { ts: now },
          })
          await segnaNotificheDocumentoLette(user.id, key)
        }
      }
    } else {
      await logAudit(session.sub, 'ADMIN_ZIP', `${finalName} (${keys.length} file)`)
    }

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
    console.error('[zip] errore:', err)
    return NextResponse.json({ error: 'Errore creazione ZIP: ' + String(err) }, { status: 500 })
  }
}
