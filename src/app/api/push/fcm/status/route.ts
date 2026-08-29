/**
 * GET /api/push/fcm/status
 *   Diagnostica FCM per l'app nativa v3: rivela se il server può davvero
 *   inviare push (credenziali FIREBASE_* configurate) e quanti token FCM
 *   sono registrati per l'utente loggato.
 *
 *   Risposta: { fcmEnabled, serverProjectId, userTokens }
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { isFcmEnabled } from '@/lib/fcm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const user = await db.user.findUnique({
    where: { username: session.sub },
    select: { id: true },
  })
  if (!user) {
    return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
  }

  const userTokens = await db.fcmToken.count({ where: { userId: user.id } })

  return NextResponse.json({
    fcmEnabled: isFcmEnabled(),
    serverProjectId: process.env.FIREBASE_PROJECT_ID || null,
    userTokens,
  })
}
