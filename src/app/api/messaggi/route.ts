import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, logAudit } from '@/lib/auth'
import { DEFAULT_ADMIN_USER } from '@/lib/pfc-utils'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  let username = searchParams.get('username') ?? ''
  if (session.role === 'client') username = session.sub
  if (!username) return NextResponse.json({ error: 'Username mancante' }, { status: 400 })

  const user = await db.user.findUnique({ where: { username } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  const messaggi = await db.message.findMany({
    where: { userId: user.id },
    orderBy: { timestamp: 'desc' },
    include: { archivedBy: true },
  })

  return NextResponse.json({
    messaggi: messaggi.map((m) => ({
      id: m.id,
      text: m.text,
      timestamp: m.timestamp,
      read: m.read,
      requiresUpload: m.requiresUpload,
      uploadReceived: m.uploadReceived,
      archivedByClient: m.archivedBy.map((a) => a.userId),
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  const { destinatario, testo, richiedeUpload } = await req.json().catch(() => ({}))
  const text = String(testo ?? '').trim()
  const dest = String(destinatario ?? '').trim().toLowerCase()

  if (!dest) return NextResponse.json({ error: 'Destinatario mancante' }, { status: 400 })
  if (dest === DEFAULT_ADMIN_USER) return NextResponse.json({ error: 'Non puoi inviare messaggi alladmin' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'Testo mancante' }, { status: 400 })
  if (text.length > 2000) return NextResponse.json({ error: 'Messaggio troppo lungo (max 2000 caratteri)' }, { status: 400 })

  const user = await db.user.findUnique({ where: { username: dest } })
  if (!user) return NextResponse.json({ error: 'Destinatario non trovato' }, { status: 404 })

  const msg = await db.message.create({
    data: {
      userId: user.id,
      text,
      requiresUpload: Boolean(richiedeUpload),
    },
  })

  await db.notification.create({
    data: {
      userId: user.id,
      type: richiedeUpload ? 'richiesta_upload' : 'messaggio',
      text: text.slice(0, 120),
      detail: '',
    },
  })

  await logAudit(session.sub, 'INVIA_MESSAGGIO', `${dest}: ${text.slice(0, 60)}`)
  return NextResponse.json({ ok: true, id: msg.id })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })

  const msg = await db.message.findUnique({ where: { id } })
  if (!msg) return NextResponse.json({ error: 'Messaggio non trovato' }, { status: 404 })

  if (session.role === 'client') {
    const user = await db.user.findUnique({ where: { username: session.sub } })
    if (!user || msg.userId !== user.id) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
    }
  }

  await db.message.delete({ where: { id } })
  if (session.role === 'admin') {
    await logAudit(session.sub, 'ELIMINA_MESSAGGIO', id)
  }
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const action = searchParams.get('action')

  if (session.role !== 'client') {
    return NextResponse.json({ error: 'Solo i clienti possono eseguire questa azione' }, { status: 403 })
  }

  const user = await db.user.findUnique({ where: { username: session.sub } })
  if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

  if (action === 'segna_letti') {
    await db.message.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    })
    return NextResponse.json({ ok: true })
  }

  if (action !== 'archivia' || !id) {
    return NextResponse.json({ error: 'Azione non supportata' }, { status: 400 })
  }

  const msg = await db.message.findUnique({ where: { id } })
  if (!msg || msg.userId !== user.id) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  await db.messageArchive.upsert({
    where: { messageId_userId: { messageId: id, userId: user.id } },
    create: { messageId: id, userId: user.id },
    update: {},
  })

  return NextResponse.json({ ok: true })
}
