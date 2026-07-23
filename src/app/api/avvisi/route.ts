import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, logAudit } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const avvisi = await db.notice.findMany({ orderBy: { timestamp: 'desc' } })
  return NextResponse.json({
    avvisi: avvisi.map((a) => ({
      id: a.id,
      text: a.text,
      timestamp: a.timestamp,
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }
  const { text } = await req.json().catch(() => ({}))
  const testo = String(text ?? '').trim()
  if (!testo) return NextResponse.json({ error: 'Testo mancante' }, { status: 400 })
  if (testo.length > 500) return NextResponse.json({ error: 'Avviso troppo lungo (max 500 caratteri)' }, { status: 400 })

  const avviso = await db.notice.create({ data: { text: testo } })

  const clienti = await db.user.findMany({ where: { role: 'client' } })
  if (clienti.length > 0) {
    await db.notification.createMany({
      data: clienti.map((c) => ({
        userId: c.id,
        type: 'avviso',
        text: `Nuovo avviso dallo studio: ${testo.slice(0, 80)}${testo.length > 80 ? '...' : ''}`,
        detail: testo,
      })),
    })
  }

  await logAudit(session.sub, 'PUBBLICA_AVVISO', testo.slice(0, 100))
  return NextResponse.json({ ok: true, id: avviso.id })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID mancante' }, { status: 400 })

  await db.notice.delete({ where: { id } })
  await logAudit(session.sub, 'ELIMINA_AVVISO', id)
  return NextResponse.json({ ok: true })
}
