/**
 * /api/messaggi/all
 * GET - admin: tutti i messaggi di tutti i clienti in una sola query
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  // Una sola query con JOIN per prendere tutti i messaggi + nome cliente
  const msgs = await db.message.findMany({
    include: {
      user: {
        select: { username: true, name: true }
      }
    },
    orderBy: { timestamp: 'desc' },
    take: 500,
  })

  return NextResponse.json({
    messaggi: msgs.map(m => ({
      id: m.id,
      text: m.text,
      timestamp: m.timestamp,
      read: m.read,
      requiresUpload: m.requiresUpload,
      uploadReceived: m.uploadReceived,
      destinatarioUsername: m.user.username,
      destinatarioNome: m.user.name,
    })),
  })
}
