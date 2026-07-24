'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import { UploadCloud, FileText, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { formatBytes, MAX_FILE_SIZE_MB } from '@/lib/pfc-utils'

interface Cliente { username: string; name: string }
interface UploadResult { nome: string; key: string; size: number; status: 'caricato' | 'saltato' | 'rinominato' | 'sostituito' }
interface CartellaMeta { nome: string; nFiles: number; nNuovi: number }

export function TabInvioDocumenti() {
  const [clienti, setClienti] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [clienteSelezionato, setClienteSelezionato] = useState('')
  const [annoEsistente, setAnnoEsistente] = useState('none')
  const [annoNuovo, setAnnoNuovo] = useState('')
  const [cartellaEsistente, setCartellaEsistente] = useState('none')
  const [cartellaNuova, setCartellaNuova] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [mode, setMode] = useState<'rename' | 'versioning' | 'skip'>('rename')
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<UploadResult[] | null>(null)
  const [cartelleDisponibili, setCartelleDisponibili] = useState<string[]>([])

  useEffect(() => {
    api.clienti.list().then((r) => { setClienti(r.clienti); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const annoFinale = annoNuovo.trim() || (annoEsistente !== 'none' ? annoEsistente : '')
  useEffect(() => {
    if (!clienteSelezionato || !annoFinale) { setCartelleDisponibili([]); return }
    api.documenti.list({ username: clienteSelezionato, anno: annoFinale })
      .then((r) => {
        // FIX: gestisci sia vecchio formato (string[]) che nuovo (oggetti)
        const carts = (r.cartelle ?? []) as unknown as Array<CartellaMeta | string>
        const nomi = carts.map((c) => typeof c === 'string' ? c : c.nome)
        setCartelleDisponibili(nomi)
      })
      .catch(() => setCartelleDisponibili([]))
  }, [clienteSelezionato, annoFinale])

  const cartellaFinale = cartellaNuova.trim().toUpperCase() || (cartellaEsistente !== 'none' ? cartellaEsistente : '')

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return
    setFiles(Array.from(e.target.files))
    setResults(null)
  }

  async function handleUpload() {
    if (!clienteSelezionato) { toast.error('Seleziona un cliente'); return }
    if (!annoFinale) { toast.error('Specifica un anno'); return }
    if (!cartellaFinale) { toast.error('Specifica una cartella'); return }
    if (files.length === 0) { toast.error('Seleziona almeno un file'); return }
    setUploading(true); setResults(null)
    try {
      const formData = new FormData()
      formData.append('username', clienteSelezionato)
      formData.append('anno', annoFinale)
      formData.append('cartella', cartellaFinale)
      formData.append('mode', mode)
      for (const f of files) formData.append('files', f)
      const res = await api.documenti.upload(formData)
      const r = (res.results ?? []) as unknown as UploadResult[]
      setResults(r)
      const nCaricati = r.filter((x) => x.status === 'caricato' || x.status === 'rinominato' || x.status === 'sostituito').length
      const nSaltati = r.filter((x) => x.status === 'saltato').length
      toast.success(`${nCaricati} file caricati${nSaltati > 0 ? `, ${nSaltati} saltati` : ''}`)
      setFiles([])
      api.documenti.list({ username: clienteSelezionato, anno: annoFinale }).then((r2) => {
        const carts = (r2.cartelle ?? []) as unknown as Array<CartellaMeta | string>
        setCartelleDisponibili(carts.map((c) => typeof c === 'string' ? c : c.nome))
      }).catch(() => {})
      const input = document.getElementById('file-input') as HTMLInputElement | null
      if (input) input.value = ''
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore upload')
    } finally {
      setUploading(false)
    }
  }

  if (loading) return (<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>)

  if (clienti.length === 0) return (
    <Card><CardContent className="py-12 text-center"><p className="text-slate-500">Nessun cliente censito. Vai in <strong>Gestione Clienti</strong> per registrarne uno.</p></CardContent></Card>
  )

  const totalSize = files.reduce((s, f) => s + f.size, 0)

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg flex items-center gap-2"><UploadCloud className="h-5 w-5 text-emerald-600" /> Caricamento Documenti</CardTitle></CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">1. Cliente destinatario</Label>
          <Select value={clienteSelezionato} onValueChange={setClienteSelezionato}>
            <SelectTrigger><SelectValue placeholder="Seleziona un cliente" /></SelectTrigger>
            <SelectContent>{clienti.map((c) => <SelectItem key={c.username} value={c.username}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">2. Anno</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Anno esistente</Label>
              <Select value={annoEsistente} onValueChange={setAnnoEsistente} disabled={!!annoNuovo.trim()}>
                <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">- Nessuno -</SelectItem>
                  {Array.from({ length: 10 }, (_, i) => String(2026 - i)).map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">...oppure nuovo anno (YYYY)</Label>
              <Input value={annoNuovo} onChange={(e) => setAnnoNuovo(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="es. 2026" maxLength={4} />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-slate-700">3. Cartella</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Cartella esistente</Label>
              <Select value={cartellaEsistente} onValueChange={setCartellaEsistente} disabled={!!cartellaNuova.trim()}>
                <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">- Nessuna -</SelectItem>
                  {cartelleDisponibili.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">...oppure nuova cartella</Label>
              <Input value={cartellaNuova} onChange={(e) => setCartellaNuova(e.target.value.toUpperCase())} placeholder="es. F24, IVA, BILANCIO" />
            </div>
          </div>
          {cartellaFinale && <p className="text-xs text-slate-500 mt-1">Cartella di destinazione: <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">{cartellaFinale}</code></p>}
        </div>
        <div className="space-y-3">
          <Label className="text-sm font-semibold text-slate-700">4. Documenti da caricare</Label>
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 hover:border-emerald-400 transition-colors bg-slate-50">
            <input id="file-input" type="file" multiple onChange={handleFileChange} className="hidden" disabled={uploading} />
            <label htmlFor="file-input" className="flex flex-col items-center justify-center cursor-pointer text-center py-4">
              <UploadCloud className="h-10 w-10 text-slate-400 mb-2" />
              <p className="text-sm font-medium text-slate-700">Trascina i file qui o clicca per selezionarli</p>
              <p className="text-xs text-slate-500 mt-1">Massimo {MAX_FILE_SIZE_MB}MB per file - Multipla selezione</p>
            </label>
          </div>
          {files.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-blue-900">{files.length} file - {formatBytes(totalSize)}</p>
                <Button variant="ghost" size="sm" onClick={() => setFiles([])} disabled={uploading}>Rimuovi tutti</Button>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1.5">
                {files.map((f, i) => {
                  const over = f.size > MAX_FILE_SIZE_MB * 1024 * 1024
                  return (
                    <div key={i} className={`flex items-center justify-between text-sm px-2 py-1.5 rounded ${over ? 'bg-red-50 text-red-900' : 'bg-white'}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 flex-shrink-0 text-slate-400" />
                        <span className="truncate font-medium">{f.name}</span>
                        {over && <Badge variant="destructive" className="text-xs">Troppo grande</Badge>}
                      </div>
                      <span className="text-xs text-slate-500 ml-2 flex-shrink-0">{formatBytes(f.size)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        {files.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">Comportamento per file con nome esistente</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as typeof mode)} className="grid grid-cols-1 gap-2">
              <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${mode === 'rename' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                <RadioGroupItem value="rename" className="mt-0.5" />
                <div><p className="text-sm font-medium text-slate-800">Rinomina automaticamente</p><p className="text-xs text-slate-500">es. nome_v2.pdf - consigliato</p></div>
              </label>
              <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${mode === 'versioning' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                <RadioGroupItem value="versioning" className="mt-0.5" />
                <div><p className="text-sm font-medium text-slate-800">Sostituisci</p><p className="text-xs text-slate-500">Vecchia versione spostata nel cestino</p></div>
              </label>
              <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${mode === 'skip' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                <RadioGroupItem value="skip" className="mt-0.5" />
                <div><p className="text-sm font-medium text-slate-800">Salta i file esistenti</p><p className="text-xs text-slate-500">Carica solo quelli nuovi</p></div>
              </label>
            </RadioGroup>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={handleUpload} disabled={uploading || files.length === 0 || !clienteSelezionato || !annoFinale || !cartellaFinale} className="bg-emerald-700 hover:bg-emerald-800 text-white">
            {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Caricamento...</> : <><UploadCloud className="h-4 w-4 mr-2" /> Invia documenti</>}
          </Button>
        </div>
        {results && (
          <div className="border-t border-slate-200 pt-4 space-y-2">
            <h4 className="text-sm font-semibold text-slate-800">Risultato caricamento</h4>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {results.map((r, i) => {
                const icon = r.status === 'caricato' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  : r.status === 'saltato' ? <AlertTriangle className="h-4 w-4 text-amber-500" />
                  : r.status === 'rinominato' ? <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  : <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                return (
                  <div key={i} className="flex items-center justify-between text-sm bg-white border border-slate-200 rounded px-3 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">{icon}<span className="truncate">{r.nome}</span></div>
                    <Badge variant="outline" className="text-xs ml-2">{r.status}</Badge>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
