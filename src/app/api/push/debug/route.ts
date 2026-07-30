import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const debug: any = { steps: [] }

  try {
    const session = await getSession()
    debug.steps.push({ step: 'getSession', result: session })

    if (!session) {
      debug.error = 'Non autenticato'
      return NextResponse.json(debug, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { username: session.sub },
      select: { id: true, username: true, name: true, role: true },
    })
    debug.steps.push({ step: 'findUser', result: user })

    if (!user) {
      debug.error = 'Utente non trovato nel DB'
      return NextResponse.json(debug)
    }

    const subsCount = await db.pushSubscription.count({ where: { userId: user.id } })
    debug.steps.push({ step: 'countSubs', userId: user.id, count: subsCount })

    const subs = await db.pushSubscription.findMany({
      where: { userId: user.id },
      select: { id: true, endpoint: true, p256dh: true, auth: true, createdAt: true },
    })
    debug.steps.push({ step: 'listSubs', count: subs.length, subs })

    debug.steps.push({
      step: 'envCheck',
      VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY ? 'SET (' + process.env.VAPID_PUBLIC_KEY.length + ' chars)' : 'MISSING',
      VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY ? 'SET (' + process.env.VAPID_PRIVATE_KEY.length + ' chars)' : 'MISSING',
      VAPID_SUBJECT: process.env.VAPID_SUBJECT || 'MISSING',
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? 'SET' : 'MISSING',
    })

    debug.ok = true
    return NextResponse.json(debug)
  } catch (err) {
    debug.error = String(err)
    debug.stack = (err as Error)?.stack
    return NextResponse.json(debug, { status: 500 })
  }
}
