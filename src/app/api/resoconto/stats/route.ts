/**
 * /api/resoconto/stats
 * GET - admin: statistiche avanzate (top doc scaricato, cliente più attivo 30gg)
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

  // Data di 30 giorni fa
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // Top documento scaricato (ultimi 30gg) - dalle azioni DOWNLOAD_DOC e SCARICA_ARCHIVIO
  const downloadLogs = await db.auditLog.findMany({
    where: {
      action: { in: ['DOWNLOAD_DOC', 'SCARICA_ARCHIVIO', 'DOWNLOAD_CASSETTO'] },
      ts: { gte: cutoff },
    },
    select: { detail: true, username: true },
  })

  // Conta per file (detail contiene il path o nome file)
  const docCount = new Map<string, { count: number; username: string }>()
  for (const log of downloadLogs) {
    if (!log.detail) continue
    // Estrai il nome file dal detail (ultimo pezzo dopo / o :)
    const parts = log.detail.split(/[/:\s]+/)
    const fileName = parts[parts.length - 1] || log.detail
    const existing = docCount.get(fileName)
    if (existing) {
      existing.count++
    } else {
      docCount.set(fileName, { count: 1, username: log.username })
    }
  }

  const topDocs = Array.from(docCount.entries())
    .map(([nome, info]) => ({ nome, count: info.count, username: info.username }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Cliente più attivo (ultimi 30gg) - tutte le azioni tranne admin
  const adminActions = [
    'CREA_CLIENTE', 'ELIMINA_CLIENTE', 'MODIFICA_CLIENTE', 'PUBBLICA_AVVISO',
    'ELIMINA_AVVISO', 'INVIA_MESSAGGIO', 'ELIMINA_MESSAGGIO', 'DELETE_DOC',
    'RECUPERA_FILE_CESTINO', 'ELIMINA_DEFINITIVO_CESTINO', 'SVUOTA_CESTINO',
    'MANUTENZIONE', 'RESET_AUDIT', 'ADMIN_ZIP', 'BACKUP_COMPLETO',
    'ESENTE_MANUTENZIONE', 'DELETE_BULK',
  ]

  const clientLogs = await db.auditLog.findMany({
    where: {
      ts: { gte: cutoff },
      action: { notIn: adminActions },
      username: { not: 'admin' },
    },
    select: { username: true, action: true },
  })

  // Conta per username
  const userCount = new Map<string, number>()
  for (const log of clientLogs) {
    userCount.set(log.username, (userCount.get(log.username) ?? 0) + 1)
  }

  // Prendi i nomi dei clienti
  const clienti = await db.user.findMany({
    where: { role: 'client' },
    select: { username: true, name: true },
  })
  const clienteMap = new Map(clienti.map((c) => [c.username, c.name]))

  const topClienti = Array.from(userCount.entries())
    .map(([username, count]) => ({ username, name: clienteMap.get(username) ?? username, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Statistiche per tipo azione (ultimi 30gg)
  const actionCount = new Map<string, number>()
  for (const log of clientLogs) {
    actionCount.set(log.action, (actionCount.get(log.action) ?? 0) + 1)
  }

  const statsByAction = Array.from(actionCount.entries())
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({
    topDocs,
    topClienti,
    statsByAction,
    periodo: '30 giorni',
  })
}
