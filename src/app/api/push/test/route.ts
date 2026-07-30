import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendPushToUser } from '@/lib/push'
import webpush from 'web-push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST() {
  try {
    const session = await getSession()
    console.log('[PUSH-TEST] session:', JSON.stringify(session))
    if (!session) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
    }

    // Diagnosi env vars
    const publicKey = process.env.VAPID_PUBLIC_KEY
    const privateKey = process.env.VAPID_PRIVATE_KEY
    const subject = process.env.VAPID_SUBJECT
    const nextPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

    console.log('[PUSH-TEST] envVars:', JSON.stringify({
      VAPID_PUBLIC_KEY: publicKey ? { len: publicKey.length, first10: publicKey.substring(0, 10) } : 'MISSING',
      VAPID_PRIVATE_KEY: privateKey ? { len: privateKey.length, first10: privateKey.substring(0, 10) } : 'MISSING',
      VAPID_SUBJECT: subject || 'MISSING',
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: nextPublicKey ? { len: nextPublicKey.length, first10: nextPublicKey.substring(0, 10) } : 'MISSING',
      keysMatch: publicKey === nextPublicKey,
    }))

    const user = await db.user.findUnique({
      where: { username: session.sub },
      select: { id: true, username: true },
    })
    console.log('[PUSH-TEST] user trovato da username:', JSON.stringify(user))

    if (user) {
      const subsCount = await db.pushSubscription.count({ where: { userId: user.id } })
      console.log('[PUSH-TEST] subsCount per userId', user.id, ':', subsCount)
    }

    const sent = await sendPushToUser(session.sub, {
      title: 'Notifica di test',
      body: 'Le notifiche push sono attive sul tuo account!',
      url: '/',
      tag: 'pfc-test',
    })
    console.log('[PUSH-TEST] sendPushToUser ha ritornato:', sent)

    if (sent === 0) {
      return NextResponse.json(
        { ok: false, msg: 'Nessuna sottoscrizione attiva. Abilita le notifiche prima di testare.' },
        { status: 200 }
      )
    }

    return NextResponse.json({ ok: true, sent })
  } catch (err) {
    console.error('[PUSH-TEST] errore:', err)
    return NextResponse.json({ error: 'Errore server', detail: String(err) }, { status: 500 })
  }
}

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  const nextPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

  return NextResponse.json({
    envVars: {
      VAPID_PUBLIC_KEY: publicKey ? { len: publicKey.length, first10: publicKey.substring(0, 10), last10: publicKey.substring(publicKey.length - 10) } : 'MISSING',
      VAPID_PRIVATE_KEY: privateKey ? { len: privateKey.length, first10: privateKey.substring(0, 10) } : 'MISSING',
      VAPID_SUBJECT: subject || 'MISSING',
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: nextPublicKey ? { len: nextPublicKey.length, first10: nextPublicKey.substring(0, 10) } : 'MISSING',
    },
    keysMatch: publicKey === nextPublicKey,
  })
}
