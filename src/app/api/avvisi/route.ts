/**
 * /api/avvisi
 * GET: lista avvisi (tutti)
 * POST: crea avviso (admin)
 * DELETE: elimina avviso (admin) ?id=...
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, logAudit } from '@/lib/auth'
import { sendPushToAll } from '@/lib/push'

export const dynamic = 'force-dynamic'
// Budget per l'invio push inline: su Vercel limita la durata massima della funzione
// mentre la push viene consegnata (più lunga con molti destinatari broadcast).
export const maxDuration = 30

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

  // NB: per gli avvisi globali NON creiamo notifiche in campanella (niente non
  // letta superflua): la push arriva comunque anche ad app chiusa e il cliente
  // vede subito il banner giallo. Nei data della push passiamo avviso.text:
  // se il cliente è già dentro con la pagina visibile, il client suona in-app
  // e mostra il toast (stessa logica del suono per le notifiche private).

  // Invio push PRIMA della risposta (await inline): garantito nell'arco di vita
  // della funzione (vedi commento in /api/messaggi).
  const pushSent = await sendPushToAll({
    title: '📢 Nuovo avviso dallo studio',
    body: testo.slice(0, 100),
    url: '/',
    tag: 'pfc-avviso',
    data: { avviso: { text: testo } },
  }).catch((e) => {
    console.error('[PUSH] avvisi errore:', e)
    return 0
  })

  await logAudit(session.sub, 'PUBBLICA_AVVISO', testo.slice(0, 100))
  return NextResponse.json({ ok: true, id: avviso.id, pushSent })
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
