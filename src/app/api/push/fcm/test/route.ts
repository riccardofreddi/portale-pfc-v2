/**
 * POST /api/push/fcm/test
 *   Invia davvero una notifica FCM di prova all'utente loggato (app nativa v3).
 *   Usa i token salvati in fcm_tokens dall'endpoint /api/push/fcm.
 *
 * MODULO ADDITIVO: non interferisce con /api/push/test (Web Push v2).
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendFcmToUser, getUserFcmTokens } from '@/lib/fcm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST() {
  try {
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

    const tokenCount = await db.fcmToken.count({ where: { userId: user.id } })
    const tokens = await getUserFcmTokens(user.id)

    if (tokens.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          msg: 'Nessun token FCM registrato. Apri l\'app sul telefono e fai login per registrare il device, poi riprova.',
          tokenCount,
        },
        { status: 200 }
      )
    }

    const sent = await sendFcmToUser(user.id, {
      title: 'Notifica di test',
      body: 'Le notifiche tipo WhatsApp funzionano sul tuo telefono! 🎉',
      url: '/',
      data: { tipo: 'test' },
    })

    if (sent === 0) {
      return NextResponse.json(
        {
          ok: false,
          msg: 'Invio fallito: Firebase ha rifiutato tutti i token (probabilmente non piu validi). Riavvia l\'app per registrare un nuovo token.',
          tokenCount: tokens.length,
        },
        { status: 200 }
      )
    }

    return NextResponse.json({ ok: true, sent, tokenCount: tokens.length })
  } catch (err) {
    console.error('[FCM-TEST] errore:', err)
    return NextResponse.json({ error: 'Errore server', detail: String(err) }, { status: 500 })
  }
}
