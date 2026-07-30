/**
 * POST /api/push/test
 *   - Invia una notifica push di test all'utente loggato.
 *   - Solo per clienti (gli admin non hanno sottoscrizioni push).
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { sendPushToUser } from '@/lib/push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
    }

    const sent = await sendPushToUser(session.sub, {
      title: '🔔 Notifica di test',
      body: 'Le notifiche push sono attive sul tuo account!',
      url: '/',
      tag: 'pfc-test',
    })

    if (sent === 0) {
      return NextResponse.json(
        { ok: false, msg: 'Nessuna sottoscrizione attiva. Abilita le notifiche prima di testare.' },
        { status: 200 }
      )
    }

    return NextResponse.json({ ok: true, sent })
  } catch (err) {
    console.error('[PUSH test] errore:', err)
    return NextResponse.json({ error: 'Errore server' }, { status: 500 })
  }
}
