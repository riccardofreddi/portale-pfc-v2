import { NextRequest, NextResponse } from 'next/server'
import { getSession, logAudit } from '@/lib/auth'
import { db } from '@/lib/db'
import { caricaBytes, haConfigurazioneR2, DOCS_PREFIX } from '@/lib/r2'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const rawKey = searchParams.get('key') ?? ''
  const key = rawKey.startsWith('/') ? rawKey.slice(1) : rawKey
  if (!key || !key.startsWith(`${DOCS_PREFIX}/`)) {
    return NextResponse.json({ error: 'Path non valido' }, { status: 400 })
  }

  if (session.role === 'client') {
    const expectedPrefix = `${DOCS_PREFIX}/${session.sub}/`
    if (!key.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'Non autorizzato per questo file' }, { status: 403 })
    }
  }

  if (!haConfigurazioneR2()) {
    return NextResponse.json({ error: 'R2 non configurato' }, { status: 500 })
  }

  const data = await caricaBytes(key)
  if (!data) return NextResponse.json({ error: 'File non trovato su R2' }, { status: 404 })

  if (session.role === 'client') {
    const user = await db.user.findUnique({ where: { username: session.sub } })
    if (user) {
      await db.fileDownload.upsert({
        where: { userId_filePath: { userId: user.id, filePath: key } },
        create: { userId: user.id, filePath: key },
        update: { ts: new Date() },
      })
    }
    await logAudit(session.sub, 'DOWNLOAD_DOC', key)
  }

  const nome = key.split('/').pop() ?? 'documento'
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`,
      'Content-Length': String(data.length),
      'Cache-Control': 'private, no-cache',
    },
  })
}
