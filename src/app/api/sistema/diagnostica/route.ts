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

  // v4.87 — REGISTRO DEL CHECK SCADENZE da system_settings: chiave
  // "ultimo_check_scadenze", UNA riga sola riscritta a ogni giro (upsert
  // da /api/scadenze/check, cron Vercel o manuale). Vale il discorso di
  // sempre: se "minutiFa" cresce oltre le ~30 ore il giro quotidiano si
  // e' fermato — si vede QUI, in una risposta, non nel silenzio. Prima
  // (v4.86) il registro era in audit_log ma riempiva l'archivio log
  // attivita' di voci "sistema": v4.87 lo sposta qui, crescita zero.
  const ultimoCheckSetting = await db.systemSetting
    .findUnique({
      where: { key: 'ultimo_check_scadenze' },
      select: { value: true },
    })
    .catch(() => null)
  let ultimoCheckQuando: string | null = null
  let ultimoCheckEsito: string | null = null
  if (ultimoCheckSetting?.value) {
    try {
      const parsed = JSON.parse(ultimoCheckSetting.value) as {
        ts?: string
        detail?: string
      }
      if (parsed.ts) ultimoCheckQuando = parsed.ts
      if (parsed.detail) ultimoCheckEsito = parsed.detail
    } catch {
      // valore non-JSON (non dovrebbe mai succedere): mostriamo il grezzo
      ultimoCheckEsito = ultimoCheckSetting.value
    }
  }
  const minutiFaCheck = ultimoCheckQuando
    ? Math.max(0, Math.round((Date.now() - new Date(ultimoCheckQuando).getTime()) / 60000))
    : null

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
    checkScadenze: {
      quando: ultimoCheckQuando,
      minutiFa: minutiFaCheck,
      esito: ultimoCheckEsito,
    },
  })
}

