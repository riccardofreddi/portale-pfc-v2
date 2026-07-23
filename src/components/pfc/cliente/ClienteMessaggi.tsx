'use client'

import { useEffect, useState } from 'react'
import { usePfcStore } from '@/store/pfc'
import { api } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { formatDateAudit } from '@/lib/pfc-utils'
import { MessageSquare, Inbox, Archive, Loader2, Paperclip, CheckCircle2 } from 'lucide-react'

interface Messaggio { id: string; text: string; timestamp: string; read: boolean; requiresUpload: boolean; uploadReceived: boolean; archivedByClient: string[] }

export function ClienteMessaggi() {
  const { user } = usePfcStore()
  const [messaggi, setMessaggi] = useState<Messaggio[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)

  async function refresh() {
    if (!user) return
    setLoading(true)
    try {
      const r = await api.messaggi.list(user.username)
      const msgs = r.messaggi as unknown as Messaggio[]
      setMessaggi(msgs)
      if (msgs.some((m) => !m.read)) {
        await api.messaggi.segnaLetti().catch(() => {})
        setMessaggi((curr) => curr.map((m) => ({ ...m, read: true })))
      }
    } catch { toast.error('Errore caricamento messaggi') }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [user])

  async function handleArchivia(id: string) {
    try { await api.messaggi.archivia(id); toast.success('Messaggio archiviato'); await refresh() }
    catch { toast.error('Errore archiviazione') }
  }

  if (loading) return (<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>)

  const visibili = messaggi.filter((m) => {
    const archived = (m.archivedByClient ?? []).includes(user?.username ?? '')
    return showArchived ? archived : !archived
  })

  if (visibili.length === 0 && !showArchived) return (
    <Card><CardContent className="py-12 text-center">
      <Inbox className="h-10 w-10 text-slate-300 mx-auto mb-3" />
      <p className="text-slate-700 font-medium mb-1">Nessun messaggio</p>
      <p className="text-sm text-slate-500">Lo studio non ha ancora inviato comunicazioni.</p>
    </CardContent></Card>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2"><MessageSquare className="h-5 w-5 text-emerald-600" /> Messaggi dallo Studio ({visibili.length})</h3>
        <Button variant="ghost" size="sm" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Nascondi archiviati' : 'Mostra archiviati'}</Button>
      </div>
      <div className="space-y-2">
        {visibili.map((m) => {
          const isNew = !m.read
          const isArchived = (m.archivedByClient ?? []).includes(user?.username ?? '')
          return (
            <div key={m.id} className={`rounded-lg p-4 border transition-all ${isArchived ? 'border-slate-200 bg-slate-50 opacity-70' : isNew ? 'border-emerald-300 bg-gradient-to-br from-emerald-50/50 to-white border-l-4 border-l-emerald-500' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="font-semibold text-sm text-slate-900">Studio PFC</span>
                <span className="text-xs text-slate-500">- {formatDateAudit(m.timestamp)}</span>
                <div className="flex-1" />
                {m.requiresUpload && !m.uploadReceived && <Badge variant="outline" className="text-xs border-amber-400 bg-amber-50 text-amber-700"><Paperclip className="h-3 w-3 mr-1" /> Richiesta doc</Badge>}
                {m.uploadReceived && <Badge variant="outline" className="text-xs border-emerald-400 bg-emerald-50 text-emerald-700"><CheckCircle2 className="h-3 w-3 mr-1" /> File inviato</Badge>}
                {isNew && <Badge variant="default" className="bg-emerald-600 text-xs">Nuovo</Badge>}
              </div>
              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{m.text}</p>
              {!isArchived && (
                <div className="mt-3 flex justify-end">
                  <Button variant="ghost" size="sm" onClick={() => handleArchivia(m.id)}><Archive className="h-3.5 w-3.5 mr-1.5" /> Archivia</Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
