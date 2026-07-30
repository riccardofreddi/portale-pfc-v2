/**
 * POST /api/push/subscribe
 *   body: { endpoint, keys: { p256dh, auth } }
 *   - Registra (o aggiorna) una sottoscrizione push per l'utente loggato.
 *
 * DELETE /api/push/subscribe
 *   body: { endpoint }
 *   - Rimuove la sottoscrizione (utente che si disiscrive o logout).
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
    }

    const body = await req.json()
    const endpoint: string | undefined = body?.endpoint
    const p256dh: string | undefined = body?.keys?.p256dh
    const auth: string | undefined = body?.keys?.auth

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: 'Payload non valido. Richiesti: endpoint, keys.p256dh, keys.auth' },
        { status: 400 }
      )
    }

    const user = await db.user.findUnique({
      where: { username: session.sub },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
    }

    // Upsert: se l'endpoint esiste già (magari di un altro utente che ha fatto logout
    // sullo stesso device), lo leghiamo all'utente corrente.
    await db.pushSubscription.upsert({
      where: { endpoint },
      create: {
        endpoint,
        p256dh,
        auth,
        userId: user.id,
      },
      update: {
        p256dh,
        auth,
        userId: user.id,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[PUSH subscribe] errore:', err)
    return NextResponse.json({ error: 'Errore server' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const endpoint: string | undefined = body?.endpoint

    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint obbligatorio' }, { status: 400 })
    }

    await db.pushSubscription.deleteMany({
      where: { endpoint },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[PUSH unsubscribe] errore:', err)
    return NextResponse.json({ error: 'Errore server' }, { status: 500 })
  }
}
