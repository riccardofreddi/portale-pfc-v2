import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { DOCS_PREFIX } from '@/lib/r2'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await db.user.findUnique({ where: { username: session.sub } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const prefs = await db.favorite.findMany({ where: { userId: user.id } })
  return NextResponse.json({ preferiti: prefs.map((p) => p.filePath) })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'client') {
    return NextResponse.json({ error: 'Solo i clienti possono gestire i preferiti' }, { status: 403 })
  }

  const { filePath } = await req.json().catch(() => ({}))
  if (!filePath || !filePath.startsWith(`${DOCS_PREFIX}/${session.sub}/`)) {
    return NextResponse.json({ error: 'Path non valido' }, { status: 400 })
  }

  const user = await db.user.findUnique({ where: { username: session.sub } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const existing = await db.favorite.findUnique({
    where: { userId_filePath: { userId: user.id, filePath } },
  })
  if (existing) {
    await db.favorite.delete({ where: { id: existing.id } })
    return NextResponse.json({ ok: true, isPreferito: false })
  }
  await db.favorite.create({ data: { userId: user.id, filePath } })
  return NextResponse.json({ ok: true, isPreferito: true })
}
