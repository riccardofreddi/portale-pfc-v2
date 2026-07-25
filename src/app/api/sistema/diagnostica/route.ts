import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { haConfigurazioneR2, listaOggetti, DOCS_PREFIX } from '@/lib/r2'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET() {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }

  const [nClienti, nAdmin, nMessaggi, nAvvisi, nNotifiche, nAudit] = await Promise.all([
    db.user.count({ where: { role: 'client' } }),
    db.user.count({ where: { role: 'admin' } }),
    db.message.count(),
    db.notice.count(),
    db.notification.count(),
    db.auditLog.count(),
  ])

  let r2Configured = false
  let r2Files = 0
  let r2Size = 0
  let r2Error: string | null = null
  if (haConfigurazioneR2()) {
    r2Configured = true
    try {
      const objs = await listaOggetti(DOCS_PREFIX + '/')
      r2Files = objs.length
      r2Size = objs.reduce((s, o) => s + o.size, 0)
    } catch (err) {
      r2Error = String(err)
    }
  }

  return NextResponse.json({
    db: {
      tabelle: [
        { nome: 'users (clienti)', righe: nClienti },
        { nome: 'users (admin)', righe: nAdmin },
        { nome: 'messages', righe: nMessaggi },
        { nome: 'notices', righe: nAvvisi },
        { nome: 'notifications', righe: nNotifiche },
        { nome: 'audit_log', righe: nAudit },
      ],
    },
    r2: {
      configurato: r2Configured,
      nFiles: r2Files,
      sizeTotale: r2Size,
      errore: r2Error,
    },
  })
}

