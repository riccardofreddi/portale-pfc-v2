import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const CLIENT_ACTIONS = [
  'DOWNLOAD_DOC', 'DOWNLOAD_CASSETTO', 'UPLOAD_CASSETTO',
  'LOGIN_SUCCESS', 'LOGOUT', 'LETTO_MESSAGGI', 'LOGIN_FAILED',
  'UPLOAD_RISPOSTA', 'RINOMINA_FILE', 'ELIMINA_FILE_CASSETTO', 'SCARICA_ARCHIVIO',
]

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
  if (session.role !== 'client') {
    return NextResponse.json({ error: 'Solo i clienti possono accedere alla propria cronologia' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '200', 10), 500)

  const logs = await db.auditLog.findMany({
    where: {
      username: session.sub,
      action: { in: CLIENT_ACTIONS },
    },
    orderBy: { ts: 'desc' },
    take: limit,
  })

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id, ts: l.ts, action: l.action, detail: l.detail,
    })),
  })
}
