import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const user = await db.user.findUnique({ where: { username: session.sub } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  await db.notification.deleteMany({
    where: { userId: user.id, read: true, ts: { lt: cutoff } },
  })

  const notifiche = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { ts: 'desc' },
    take: 20,
  })

  return NextResponse.json({
    notifiche: notifiche.map((n) => ({
      id: n.id,
      type: n.type,
      text: n.text,
      detail: n.detail,
      ts: n.ts,
      read: n.read,
      year: n.year,
      folder: n.folder,
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const user = await db.user.findUnique({ where: { username: session.sub } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  if (action === 'segna_lette') {
    await db.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } })
    return NextResponse.json({ ok: true })
  }
  if (action === 'pulisci_lette') {
    await db.notification.deleteMany({ where: { userId: user.id, read: true } })
    return NextResponse.json({ ok: true })
  }
  if (action === 'pulisci_tutte') {
    await db.notification.deleteMany({ where: { userId: user.id } })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Azione non supportata' }, { status: 400 })
}
