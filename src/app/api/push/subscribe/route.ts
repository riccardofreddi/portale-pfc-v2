import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { endpoint, keys } = body as {
      endpoint: string
      keys: { p256dh: string; auth: string }
    }

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: 'Dati iscrizione mancanti' }, { status: 400 })
    }

    // Trova l'utente
    const user = await db.user.findUnique({ where: { username: session.sub } })
    if (!user) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
    }

    // Verifica se esiste già questa iscrizione
    const existing = await db.pushSubscription.findFirst({
      where: { userId: user.id, endpoint },
    })

    if (existing) {
      return NextResponse.json({ ok: true, message: 'Già iscritto' })
    }

    // Crea nuova iscrizione
    await db.pushSubscription.create({
      data: {
        userId: user.id,
        endpoint,
        p256dhKey: keys.p256dh,
        authKey: keys.auth,
      },
    })

    console.log(`[push] Nuova iscrizione da ${session.sub}`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[push/subscribe] errore:', err)
    return NextResponse.json({ error: 'Errore iscrizione' }, { status: 500 })
  }
}

// DELETE - rimuovi iscrizione (unsubscribe)
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const endpoint = searchParams.get('endpoint')

    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint mancante' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { username: session.sub } })
    if (!user) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
    }

    await db.pushSubscription.deleteMany({
      where: { userId: user.id, endpoint },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[push/unsubscribe] errore:', err)
    return NextResponse.json({ error: 'Errore' }, { status: 500 })
  }
}
