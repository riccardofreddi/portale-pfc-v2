import { NextResponse } from 'next/server'
import { getSession, clearSessionCookie, logAudit } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  // Il cookie va azzerato SUBITO: il logout non deve mai dipendere da query
  // lente o fallite sul DB. L'audit viene fatto in background (fire-and-forget).
  const session = await getSession().catch(() => null)
  await clearSessionCookie()
  if (session && session.sub !== 'admin') {
    logAudit(session.sub, 'LOGOUT', 'Logout manuale').catch(() => {})
  }
  return NextResponse.json({ ok: true })
}
