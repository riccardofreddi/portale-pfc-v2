'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { formatDateAudit } from '@/lib/pfc-utils'
import { ClipboardList, Inbox, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

interface AuditLog {
  id: string
  ts: string
  action: string
  detail: string
}

const PAGE_SIZE = 10

const ACTION_ICONS: Record<string, string> = {
  DOWNLOAD_DOC: '📥',
  DOWNLOAD_CASSETTO: '💼',
  UPLOAD_CASSETTO: '📤',
  LOGIN_SUCCESS: '🔑',
  LOGOUT: '🚪',
  LETTO_MESSAGGI: '💬',
  LOGIN_FAILED: '❌',
  UPLOAD_RISPOSTA: '📤',
  RINOMINA_FILE: '✏️',
  ELIMINA_FILE_CASSETTO: '🗑️',
  SCARICA_ARCHIVIO: '📦',
  ANTEPRIMA: '👁️',
}

const ACTION_LABELS: Record<string, string> = {
  DOWNLOAD_DOC: 'Download documento',
  DOWNLOAD_CASSETTO: 'Download cassetto',
  UPLOAD_CASSETTO: 'Upload cassetto',
  LOGIN_SUCCESS: 'Accesso',
  LOGOUT: 'Logout',
  LETTO_MESSAGGI: 'Messaggi letti',
  LOGIN_FAILED: 'Login fallito',
  UPLOAD_RISPOSTA: 'Risposta inviata',
  RINOMINA_FILE: 'Rinomina file',
  ELIMINA_FILE_CASSETTO: 'Elimina file cassetto',
  SCARICA_ARCHIVIO: 'Scarica archivio',
  ANTEPRIMA: 'Anteprima',
}

const ACTION_BORDER: Record<string, string> = {
  LOGIN_SUCCESS: '#245036',
  LOGIN_FAILED: '#7A3C29',
  LOGOUT: '#737F6C',
  DOWNLOAD_DOC: '#2D5245',
  DOWNLOAD_CASSETTO: '#2D5245',
  UPLOAD_CASSETTO: '#33613D',
  UPLOAD_RISPOSTA: '#33613D',
  LETTO_MESSAGGI: '#3C6A5B',
  RINOMINA_FILE: '#8C6A22',
  ELIMINA_FILE_CASSETTO: '#7A3C29',
  SCARICA_ARCHIVIO: '#5C3B66',
  ANTEPRIMA: '#9DA894',
}

export function ClienteAttivita() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  async function refresh() {
    setLoading(true)
    try {
      const r = await api.audit.meList(200)
      setLogs(r.logs)
    } catch {
      toast.error('Errore caricamento attività')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  )

  const total = logs.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const start = (currentPage - 1) * PAGE_SIZE
  const end = Math.min(start + PAGE_SIZE, total)
  const pageLogs = logs.slice(start, end)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-emerald-600" />
          Le mie attività
        </h3>
        <p className="text-sm text-slate-500 mt-1">Cronologia completa delle tue operazioni</p>
      </div>

      {total === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-700 font-medium mb-1">Nessuna attività registrata</p>
            <p className="text-sm text-slate-500">Le tue operazioni appariranno qui.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {pageLogs.map((log) => {
              const icon = ACTION_ICONS[log.action] ?? '✏️'
              const label = ACTION_LABELS[log.action] ?? log.action
              const borderColor = ACTION_BORDER[log.action] ?? '#94a3b8'
              return (
                <div
                  key={log.id}
                  className="flex items-center gap-3 bg-white border border-slate-200 border-l-4 p-3 rounded-lg"
                  style={{ borderLeftColor: borderColor }}
                >
                  <span className="text-xl">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-900">{label}</p>
                    <p className="text-xs text-slate-500 truncate">{log.detail}</p>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">{formatDateAudit(log.ts)}</span>
                </div>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Precedente
              </Button>
              <span className="text-sm text-slate-600">
                Pagina {currentPage} di {totalPages} ({total} attività)
              </span>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
                Successiva <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
