import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  // Usa relazione Prisma: una sola query invece di findUnique + findMany
  const notifiche = await db.notification.findMany({
    where: { user: { username: session.sub } },
    orderBy: { ts: 'desc' },
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
  const id = searchParams.get('id') // ID singola notifica per segna letta

  // Una sola lookup utente riusata per tutte le azioni
  const user = await db.user.findUnique({ where: { username: session.sub }, select: { id: true } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  if (action === 'segna_lette') {
    if (id) {
      await db.notification.updateMany({ where: { id, userId: user.id }, data: { read: true } })
    } else {
      await db.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } })
    }
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
