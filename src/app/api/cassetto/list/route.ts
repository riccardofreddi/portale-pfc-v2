import { NextRequest, NextResponse } from 'next/server'
import { getSession, logAudit } from '@/lib/auth'
import { listCassettoFiles, haConfigurazioneR2, DOCS_PREFIX } from '@/lib/r2'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  if (!haConfigurazioneR2()) {
    return NextResponse.json({ error: 'R2 non configurato' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  let username = searchParams.get('username') ?? session.sub
  if (session.role === 'client') username = session.sub

  try {
    const files = await listCassettoFiles(username)
    return NextResponse.json({ files })
  } catch (err) {
    console.error('[cassetto/list] errore:', err)
    return NextResponse.json({ error: `Errore: ${String(err)}` }, { status: 500 })
  }
}
