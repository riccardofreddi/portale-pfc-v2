/**
 * POST /api/push/fcm
 *   body: { token, device? }
 *   - Registra (o aggiorna) un token FCM per l'utente loggato (app nativa v3).
 *
 * DELETE /api/push/fcm
 *   body: { token }
 *   - Rimuove il token (logout / disinstallazione app).
 *
 * MODULO ADDITIVO: non interferisce con /api/push/subscribe (Web Push v2).
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
    const token: string | undefined = body?.token
    const device: string | undefined = body?.device

    if (!token) {
      return NextResponse.json({ error: 'token obbligatorio' }, { status: 400 })
    }

    const user = await db.user.findUnique({
      where: { username: session.sub },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
    }

    await db.fcmToken.upsert({
      where: { token },
      create: { token, device: device ?? null, userId: user.id },
      update: { device: device ?? null, userId: user.id },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[FCM subscribe] errore:', err)
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
    const token: string | undefined = body?.token
    if (!token) {
      return NextResponse.json({ error: 'token obbligatorio' }, { status: 400 })
    }

    await db.fcmToken.deleteMany({ where: { token } })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[FCM unsubscribe] errore:', err)
    return NextResponse.json({ error: 'Errore server' }, { status: 500 })
  }
}
