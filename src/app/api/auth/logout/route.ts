import { NextResponse } from 'next/server'
import { getSession, clearSessionCookie, logAudit } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST() {
  // Il cookie va azzerato SUBITO: il logout non deve mai dipendere da query
  // lente o fallite sul DB.
  const session = await getSession().catch(() => null)
  await clearSessionCookie()
  if (session && session.sub !== 'admin') {
    // NB: atteso, NON fire-and-forget. Su serverless (Vercel) una promessa
    // non attesa muore con la funzione quando termina la richiesta e il LOGOUT
    // non verrebbe mai scritto. logAudit gestisce già gli errori internamente.
    await logAudit(session.sub, 'LOGOUT', 'Logout manuale')
  }
  return NextResponse.json({ ok: true })
}
