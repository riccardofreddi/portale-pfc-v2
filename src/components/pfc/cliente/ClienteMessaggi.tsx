'use client'

import { useEffect, useState } from 'react'
import { usePfcStore } from '@/store/pfc'
import { api } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { formatDateAudit, formatBytes, MAX_FILE_SIZE_MB } from '@/lib/pfc-utils'
import { MessageSquare, Inbox, Archive, ArchiveRestore, Loader2, Paperclip, CheckCircle2, UploadCloud, FileText } from 'lucide-react'

interface Messaggio {
  id: string
  text: string
  timestamp: string
  read: boolean
  requiresUpload: boolean
  uploadReceived: boolean
  archivedByClient: string[]
}

export function ClienteMessaggi() {
  const { user } = usePfcStore()
  const [messaggi, setMessaggi] = useState<Messaggio[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [uploadingMsgId, setUploadingMsgId] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await api.messaggi.list(user.username)
        if (cancelled) return
        const msgs = r.messaggi as unknown as Messaggio[]
        setMessaggi(msgs)
        if (msgs.some((m) => !m.read)) {
          await api.messaggi.segnaLetti().catch(() => {})
          if (cancelled) return
          setMessaggi((curr) => curr.map((m) => ({ ...m, read: true })))
          // Comunica a ClienteArea di aggiornare il pallino sulla tab Messaggi
          window.dispatchEvent(new Event('pfc-messaggi-letti'))
        }
      } catch {
        if (!cancelled) toast.error('Errore caricamento messaggi')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user])

  async function handleArchivia(id: string) {
    try {
      await api.messaggi.archivia(id)
      setMessaggi((curr) => curr.map((m) => m.id === id ? { ...m, archivedByClient: [...(m.archivedByClient ?? []), user?.username ?? ''] } : m))
      toast.success('Messaggio archiviato')
    } catch { toast.error('Errore archiviazione') }
  }

  async function handleDearchivia(id: string) {
    try {
      await api.messaggi.dearchivia(id)
      setMessaggi((curr) => curr.map((m) => m.id === id ? { ...m, archivedByClient: (m.archivedByClient ?? []).filter((u) => u !== user?.username) } : m))
      toast.success('Messaggio ripristinato')
    } catch { toast.error('Errore ripristino') }
  }

  function handleFileSelect(msgId: string, file: File | null) {
    setSelectedMsgId(msgId)
    setSelectedFile(file)
  }

  async function handleUploadRisposta(msgId: string) {
    if (!selectedFile) { toast.error('Seleziona un file'); return }
    if (selectedFile.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(`File troppo grande (max ${MAX_FILE_SIZE_MB}MB)`)
      return
    }
    setUploadingMsgId(msgId)
    try {
      const formData = new FormData()
      formData.append('msgId', msgId)
      formData.append('file', selectedFile)
      await api.risposte.upload(formData)
      toast.success('File inviato allo studio con successo!')
      setMessaggi((curr) => curr.map((m) => m.id === msgId ? { ...m, uploadReceived: true } : m))
      setSelectedFile(null)
      setSelectedMsgId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore upload')
    } finally {
      setUploadingMsgId(null)
    }
  }

  if (loading) return (<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>)
  const username = user?.username ?? ''
  const visibili = messaggi.filter((m) => {
    const archived = m.archivedByClient?.includes(username) ?? false
    return showArchived ? archived : !archived
  })
  const nArchiviati = messaggi.filter((m) => m.archivedByClient?.includes(username) ?? false).length

  if (visibili.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-emerald-600" />
            {showArchived ? 'Messaggi archiviati (0)' : 'Messaggi dallo Studio (0)'}
          </h3>
          {showArchived ? (
            <Button variant="ghost" size="sm" onClick={() => setShowArchived(false)}>
              Torna ai messaggi
            </Button>
          ) : (
            nArchiviati > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowArchived(true)}>
                Mostra archiviati ({nArchiviati})
              </Button>
            )
          )}
        </div>
        <Card><CardContent className="py-12 text-center">
          <Inbox className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 font-medium mb-1">
            {showArchived ? 'Nessun messaggio archiviato' : 'Nessun messaggio'}
          </p>
          <p className="text-sm text-slate-500">
            {showArchived
              ? 'Non hai ancora archiviato alcun messaggio.'
              : nArchiviati > 0
                ? `Hai ${nArchiviati} messaggi archiviati. Clicca "Mostra archiviati" per vederli.`
                : 'Lo studio non ha ancora inviato comunicazioni.'}
          </p>
        </CardContent></Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-emerald-600" />
          {showArchived ? `Messaggi archiviati (${visibili.length})` : `Messaggi dallo Studio (${visibili.length})`}
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? 'Torna ai messaggi' : `Mostra archiviati (${nArchiviati})`}
        </Button>
      </div>

      <div className="space-y-3">
        {visibili.map((m) => {
          const isNew = !m.read
          const isArchived = m.archivedByClient?.includes(user?.username ?? '') ?? false
          return (
            <div key={m.id} className={`rounded-lg p-4 border transition-all ${isArchived ? 'border-slate-200 bg-slate-50 opacity-70' : isNew ? 'border-emerald-300 bg-gradient-to-br from-emerald-50/50 to-white border-l-4 border-l-emerald-500' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="font-semibold text-sm text-slate-900">Studio PFC</span>
                <span className="text-xs text-slate-500">· {formatDateAudit(m.timestamp)}</span>
                {isArchived && (
                  <Badge variant="outline" className="text-xs border-slate-400 bg-slate-100 text-slate-600">
                    <Archive className="h-3 w-3 mr-1" /> Archiviato
                  </Badge>
                )}
                <div className="flex-1" />
                {m.requiresUpload && !m.uploadReceived && (
                  <Badge variant="outline" className="text-xs border-amber-400 bg-amber-50 text-amber-700">
                    <Paperclip className="h-3 w-3 mr-1" /> Richiesta documenti
                  </Badge>
                )}
                {m.uploadReceived && (
                  <Badge variant="outline" className="text-xs border-emerald-400 bg-emerald-50 text-emerald-700">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> File inviato
                  </Badge>
                )}
                {isNew && <Badge variant="default" className="bg-emerald-600 text-xs">Nuovo</Badge>}
              </div>
              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{m.text.split(/(https?:\/\/[^\s]+)/g).map((part, i) => part.match(/^https?:\/\//) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline hover:text-blue-800">{part}</a> : part)}</p>

              {m.requiresUpload && !m.uploadReceived && (
                <div className="mt-3 bg-amber-50 border border-amber-300 rounded-lg p-3 space-y-3">
                  <div>
                    <p className="text-xs font-bold text-amber-800 mb-1">📤 Carica il documento per questa richiesta</p>
                    <p className="text-xs text-amber-700">Trascina qui il file oppure clicca per selezionarlo (max {MAX_FILE_SIZE_MB}MB)</p>
                  </div>
                  <Input
                    type="file"
                    onChange={(e) => handleFileSelect(m.id, e.target.files?.[0] ?? null)}
                    className="bg-white text-base sm:text-sm h-10"
                  />
                  {selectedFile && selectedMsgId === m.id && (
                    <div className="bg-blue-50 border border-blue-300 border-l-4 border-l-blue-500 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-bold text-blue-900">📋 Anteprima file selezionato</p>
                      <div className="flex items-center gap-2 text-xs sm:text-sm text-blue-800 flex-wrap">
                        <FileText className="h-4 w-4 flex-shrink-0" />
                        <span className="font-medium truncate">{selectedFile.name}</span>
                        <span className="text-xs text-blue-600">· {formatBytes(selectedFile.size)}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <Button variant="outline" size="sm" className="w-full sm:w-auto h-9 text-xs" onClick={() => { setSelectedFile(null); setSelectedMsgId(null) }}>
                          Annulla
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleUploadRisposta(m.id)}
                          disabled={uploadingMsgId === m.id}
                          className="bg-emerald-700 hover:bg-emerald-800 text-white w-full sm:w-auto h-9 text-xs"
                        >
                          {uploadingMsgId === m.id ? (
                            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Invio in corso...</>
                          ) : (
                            <><UploadCloud className="h-3.5 w-3.5 mr-1.5" /> Conferma e invia file</>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {m.uploadReceived && (
                <div className="mt-3 bg-emerald-50 border border-emerald-300 rounded-lg p-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <p className="text-xs text-emerald-800 font-medium">
                    File inviato con successo.
                  </p>
                </div>
              )}

              <div className="mt-3 flex justify-end">
                {isArchived ? (
                  <Button variant="outline" size="sm" onClick={() => handleDearchivia(m.id)}>
                    <ArchiveRestore className="h-3.5 w-3.5 mr-1.5" /> Ripristina
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => handleArchivia(m.id)}>
                    <Archive className="h-3.5 w-3.5 mr-1.5" /> Archivia
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}