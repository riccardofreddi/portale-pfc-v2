import { NextResponse } from 'next/server'
import { getSession, clearSessionCookie, logAudit } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getSession()
  if (session && session.sub !== 'admin') {
    await 
  }
  await clearSessionCookie()
  return NextResponse.json({ ok: true })
}
