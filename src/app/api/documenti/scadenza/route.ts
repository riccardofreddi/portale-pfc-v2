/**
 * /api/documenti/scadenza
 *
 * GET  ?filePath=...        → restituisce la scadenza del file (se esiste)
 * POST { filePath, titolo, dataScadenza, anticipoGiorni }
 *                            → crea/aggiorna la scadenza del file (solo admin)
 * DELETE ?filePath=...       → rimuove la scadenza del file (solo admin)
 *
 * Una scadenza per file (1:1 con filePath). La data è in formato YYYY-MM-DD
 * (o ISO completo). anticipoGiorni = quanti giorni prima avvisare (default 10).
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, logAudit } from '@/lib/auth'
import { notifyScadenzaImminente } from '@/lib/scadenza-notify'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const filePath = searchParams.get('filePath')
  if (!filePath) return NextResponse.json({ error: 'filePath mancante' }, { status: 400 })

  // I clienti vedono solo le proprie scadenze.
  const where: { filePath: string; userId?: string } = { filePath }
  if (session.role === 'client') {
    const user = await db.user.findUnique({ where: { username: session.sub }, select: { id: true } })
    if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
    where.userId = user.id
  }

  const scadenza = await db.scadenza.findUnique({ where: { filePath } })
  return NextResponse.json({ scadenza: scadenza ?? null })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }
  const { filePath, titolo, dataScadenza, anticipoGiorni } = await req.json().catch(() => ({}))
  if (!filePath || typeof filePath !== 'string') {
    return NextResponse.json({ error: 'filePath mancante' }, { status: 400 })
  }
  const data = new Date(String(dataScadenza))
  if (isNaN(data.getTime())) {
    return NextResponse.json({ error: 'Data di scadenza non valida' }, { status: 400 })
  }
  const titoloFinal = String(titolo ?? '').trim() || filePath.split('/').pop() || 'Documento'
  const anticipo = Number.isFinite(Number(anticipoGiorni)) ? Number(anticipoGiorni) : 10

  // L'utente proprietario del file: ricava dallo username nella chiave R2
  // Documenti/<username>/<anno>/<cartella>/<file>.
  const parts = filePath.split('/')
  const username = parts[1]
  const user = await db.user.findUnique({ where: { username } })
  if (!user) return NextResponse.json({ error: 'Cliente non trovato' }, { status: 404 })

  const scadenza = await db.scadenza.upsert({
    where: { filePath },
    create: {
      filePath,
      userId: user.id,
      titolo: titoloFinal,
      dataScadenza: data,
      anticipoGiorni: anticipo,
      notificata: false,
    },
    update: {
      titolo: titoloFinal,
      dataScadenza: data,
      anticipoGiorni: anticipo,
      notificata: false,
    },
  })

  // Notifica immediata se la scadenza è già nel periodo di preavviso.
  // Così, quando l'admin imposta/modifica una scadenza imminente, il cliente
  // riceve subito campanella + push senza dover aspettare il cron notturno.
  const { notified: notificataImmediata } = await notifyScadenzaImminente({
    scadenzaId: scadenza.id,
    userId: user.id,
    username: user.username,
    titolo: titoloFinal,
    filePath,
    dataScadenza: data,
    anticipoGiorni: anticipo,
    pagata: scadenza.pagata,
  })

  await logAudit(session.sub, 'IMPOSTA_SCADENZA', `${filePath} -> ${data.toISOString().slice(0, 10)}`)
  return NextResponse.json({ ok: true, scadenza, notificataImmediata })
}

export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const filePath = searchParams.get('filePath')
  if (!filePath) return NextResponse.json({ error: 'filePath mancante' }, { status: 400 })

  await db.scadenza.deleteMany({ where: { filePath } })
  await logAudit(session.sub, 'RIMUOVI_SCADENZA', filePath)
  return NextResponse.json({ ok: true })
}
