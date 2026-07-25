'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import { formatDateAudit } from '@/lib/pfc-utils'
import { Plus, Trash2, Send, Megaphone, MessageSquare, Loader2 } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

interface Avviso { id: string; text: string; timestamp: string }
interface Messaggio { id: string; text: string; timestamp: string; read: boolean; requiresUpload: boolean; uploadReceived: boolean }
interface Cliente { username: string; name: string }

export function TabBacheca() {
  const [avvisi, setAvvisi] = useState<Avviso[]>([])
  const [messaggi, setMessaggi] = useState<(Messaggio & { destinatarioNome: string; destinatarioUsername: string })[]>([])
  const [clienti, setClienti] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [avvisoText, setAvvisoText] = useState('')
  const [postingAvviso, setPostingAvviso] = useState(false)
  const [msgDest, setMsgDest] = useState('')
  const [msgText, setMsgText] = useState('')
  const [msgReqUpload, setMsgReqUpload] = useState(false)
  const [postingMsg, setPostingMsg] = useState(false)
  const [filtroCliente, setFiltroCliente] = useState('tutti')

  async function refresh() {
    setLoading(true)
    try {
      // Una sola chiamata per tutto (avvisi + clienti + messaggi)
      const [rAvv, rCli, rAllMsgs] = await Promise.all([
        api.avvisi.list(),
        api.clienti.list(),
        fetch('/api/messaggi/all').then(r => r.json()).catch(() => ({ messaggi: [] })),
      ])
      setAvvisi(rAvv.avvisi)
      setClienti(rCli.clienti)
      const allMsgsData = (rAllMsgs.messaggi || []) as Array<Messaggio & { destinatarioNome: string; destinatarioUsername: string }>
      allMsgsData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      setMessaggi(allMsgsData)
    } catch { toast.error('Errore caricamento') }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  async function handlePubblicaAvviso() {
    if (!avvisoText.trim()) { toast.error('Testo avviso vuoto'); return }
    setPostingAvviso(true)
    try {
      const res = await fetch('/api/avvisi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: avvisoText.trim() }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore')
      // Aggiornamento ottimistico: aggiungi in cima senza re-fetch
      setAvvisi((prev) => [{ id: data.id, text: avvisoText.trim(), timestamp: new Date().toISOString() }, ...prev])
      toast.success('Avviso pubblicato'); setAvvisoText('')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Errore') }
    finally { setPostingAvviso(false) }
  }

  async function handleEliminaAvviso(id: string) {
    try {
      await api.avvisi.delete(id)
      // Rimuovi localmente senza re-fetch
      setAvvisi((prev) => prev.filter((a) => a.id !== id))
      toast.success('Avviso eliminato')
    } catch { toast.error('Errore eliminazione') }
  }

  async function handleInviaMsg() {
    if (!msgDest) { toast.error('Seleziona destinatario'); return }
    if (!msgText.trim()) { toast.error('Testo vuoto'); return }
    setPostingMsg(true)
    try {
      const res = await fetch('/api/messaggi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ destinatario: msgDest, testo: msgText.trim(), richiedeUpload: msgReqUpload }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Errore')
      const destCliente = clienti.find((c) => c.username === msgDest)
      // Aggiornamento ottimistico: aggiungi in cima senza re-fetch
      setMessaggi((prev) => [{ id: data.id, text: msgText.trim(), timestamp: new Date().toISOString(), read: false, requiresUpload: msgReqUpload, uploadReceived: false, destinatarioUsername: msgDest, destinatarioNome: destCliente?.name ?? msgDest }, ...prev])
      toast.success('Messaggio inviato'); setMsgDest(''); setMsgText(''); setMsgReqUpload(false)
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Errore') }
    finally { setPostingMsg(false) }
  }

  async function handleEliminaMsg(id: string) {
    try {
      await api.messaggi.delete(id)
      // Rimuovi localmente senza re-fetch
      setMessaggi((prev) => prev.filter((m) => m.id !== id))
      toast.success('Messaggio eliminato')
    } catch { toast.error('Errore eliminazione') }
  }

  if (loading) return (<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>)

  const messaggiFiltrati = filtroCliente === 'tutti' ? messaggi : messaggi.filter((m) => m.destinatarioUsername === filtroCliente)
  const nNonLetti = messaggi.filter((m) => !m.read).length

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Megaphone className="h-5 w-5 text-amber-500" /> Avvisi globali</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <Label>Testo avviso</Label>
            <Textarea value={avvisoText} onChange={(e) => setAvvisoText(e.target.value)} placeholder='es. "Studio chiuso dal 14 al 21 agosto"' rows={4} maxLength={500} />
            <p className="text-xs text-slate-500">{avvisoText.length}/500 caratteri</p>
            <Button onClick={handlePubblicaAvviso} disabled={postingAvviso || !avvisoText.trim()} className="bg-amber-600 hover:bg-amber-700 text-white">
              {postingAvviso ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Pubblica avviso
            </Button>
          </div>
          <div>
            <Label className="mb-2 block">Avvisi pubblicati ({avvisi.length})</Label>
            {avvisi.length === 0 ? (
              <p className="text-sm text-slate-500 italic">Nessun avviso pubblicato</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {avvisi.map((a) => (
                  <div key={a.id} className="border border-amber-200 border-l-4 bg-amber-50/50 rounded p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 mb-1">{formatDateAudit(a.timestamp)}</p>
                        <p className="whitespace-pre-wrap text-slate-800">{a.text}</p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 flex-shrink-0"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminare l'avviso?</AlertDialogTitle>
                            <AlertDialogDescription>L'avviso verra rimosso e non sara piu visibile ai clienti.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleEliminaAvviso(a.id)} className="bg-red-600 hover:bg-red-700">Elimina</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-emerald-600" /> Messaggi privati
            {nNonLetti > 0 && <Badge className="bg-red-100 text-red-700 border-red-200">{nNonLetti} non letti</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <Label>Nuovo messaggio</Label>
            <Select value={msgDest} onValueChange={(v) => setMsgDest(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="Destinatario" /></SelectTrigger>
              <SelectContent>{clienti.map((c) => <SelectItem key={c.username} value={c.username}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex items-center space-x-2">
              <Checkbox id="req-upload" checked={msgReqUpload} onCheckedChange={(v) => setMsgReqUpload(Boolean(v))} />
              <Label htmlFor="req-upload" className="text-sm cursor-pointer">Richiedi un file al cliente</Label>
            </div>
            <Textarea value={msgText} onChange={(e) => setMsgText(e.target.value)} placeholder="Scrivi il messaggio per il cliente..." rows={5} maxLength={2000} />
            <p className="text-xs text-slate-500">{msgText.length}/2000 caratteri</p>
            <Button onClick={handleInviaMsg} disabled={postingMsg || !msgDest || !msgText.trim()} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {postingMsg ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Invia messaggio
            </Button>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Storico messaggi ({messaggiFiltrati.length})</Label>
              <Select value={filtroCliente} onValueChange={(v) => setFiltroCliente(v ?? 'tutti')}>
                <SelectTrigger className="w-48 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tutti">Tutti i clienti</SelectItem>
                  {clienti.map((c) => <SelectItem key={c.username} value={c.username}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {messaggiFiltrati.length === 0 ? (
              <p className="text-sm text-slate-500 italic py-4 text-center">Nessun messaggio</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {messaggiFiltrati.map((m) => (
                  <div key={m.id} className={`rounded p-3 text-sm border ${m.read ? 'border-slate-200 bg-white' : 'border-red-300 bg-red-50 border-l-4 border-l-red-500'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-700">A: {filtroCliente === 'tutti' ? m.destinatarioNome : m.destinatarioUsername}</span>
                        {m.requiresUpload && <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">Richiesta file</Badge>}
                        {m.uploadReceived && <Badge variant="outline" className="text-xs border-emerald-400 text-emerald-700">File ricevuto</Badge>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant={m.read ? 'secondary' : 'destructive'} className="text-xs">{m.read ? 'Letto' : 'Da leggere'}</Badge>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 h-6 w-6 p-0"><Trash2 className="h-3 w-3" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eliminare il messaggio?</AlertDialogTitle>
                              <AlertDialogDescription>Il messaggio verra rimosso definitivamente.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleEliminaMsg(m.id)} className="bg-red-600 hover:bg-red-700">Elimina</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mb-1">{formatDateAudit(m.timestamp)}</p>
                    <p className="whitespace-pre-wrap text-slate-800">{m.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
