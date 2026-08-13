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
import { sendPushToUser } from '@/lib/push'

export const dynamic = 'force-dynamic'

// Giorni interi che mancano dalla data scadenza rispetto a oggi (>=0 = futura).
function giorniMancanti(data: Date, oggi: Date): number {
  const msAlGiorno = 24 * 60 * 60 * 1000
  const d1 = Math.floor(data.getTime() / msAlGiorno)
  const d0 = Math.floor(oggi.getTime() / msAlGiorno)
  return d1 - d0
}

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
  const oggi = new Date()
  const giorni = giorniMancanti(data, oggi)
  const imminente = giorni <= anticipo && !scadenza.pagata
  if (imminente) {
    const quando = giorni <= 0 ? 'scade oggi' : `scade tra ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}`
    const text = `${titoloFinal}: ${quando} (${data.toLocaleDateString('it-IT')})`

    await db.notification.create({
      data: {
        userId: user.id,
        type: 'scadenza',
        text,
        detail: filePath,
      },
    })

    await sendPushToUser(user.username, {
      title: '⏰ Scadenza imminente',
      body: text,
      url: '/',
      tag: 'pfc-scadenza-' + scadenza.id,
    }).catch((e) => console.error('[SCADENZA] push errore:', e))

    // Evita di rimandarla anche col cron notturno.
    await db.scadenza.update({ where: { id: scadenza.id }, data: { notificata: true } })
  }

  await logAudit(session.sub, 'IMPOSTA_SCADENZA', `${filePath} -> ${data.toISOString().slice(0, 10)}`)
  return NextResponse.json({ ok: true, scadenza, notificataImmediata: imminente })
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
