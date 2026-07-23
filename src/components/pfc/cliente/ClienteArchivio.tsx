'use client'

import { useEffect, useState } from 'react'
import { usePfcStore, type FileItem } from '@/store/pfc'
import { api } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { ottieniIconaFile, canPreviewFile, formatBytes, formatDateShort } from '@/lib/pfc-utils'
import { FolderOpen, Folder, Download, Eye, Star, StarOff, Package, Loader2, ChevronLeft, ChevronRight, Inbox, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 10
const STATO_CONFIG = {
  preferito: { icon: '*', label: 'Preferito', color: 'text-amber-600' },
  nuovo: { icon: 'N', label: 'Nuovo', color: 'text-red-600' },
  visto: { icon: 'V', label: 'Visto', color: 'text-blue-600' },
  scaricato: { icon: 'S', label: 'Scaricato', color: 'text-emerald-600' },
}

export function ClienteArchivio() {
  const { user, annoSelezionato, cartellaSelezionata, setAnno, setCartella, setPreviewFile, selectedFiles, toggleSelected, clearSelected } = usePfcStore()
  const [anni, setAnni] = useState<string[]>([])
  const [cartelle, setCartelle] = useState<string[]>([])
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [r2Error, setR2Error] = useState(false)

  const username = user?.username ?? ''

  useEffect(() => {
    if (!username) return
    setLoading(true)
    api.documenti.list({ username })
      .then((r) => {
        if (r.r2NotConfigured) { setR2Error(true); setAnni([]); return }
        setR2Error(false)
        setAnni(r.anni ?? [])
        if ((r.anni ?? []).length > 0 && !annoSelezionato) setAnno(r.anni![0])
      })
      .catch(() => toast.error('Errore caricamento anni'))
      .finally(() => setLoading(false))
  }, [username, annoSelezionato, setAnno])

  useEffect(() => {
    if (!username || !annoSelezionato) { setCartelle([]); return }
    api.documenti.list({ username, anno: annoSelezionato })
      .then((r) => {
        setCartelle(r.cartelle ?? [])
        if ((r.cartelle ?? []).length > 0 && !cartellaSelezionata) setCartella(r.cartelle![0])
        else if ((r.cartelle ?? []).length === 0) setCartella(null)
      })
      .catch(() => toast.error('Errore caricamento cartelle'))
  }, [username, annoSelezionato, cartellaSelezionata, setCartella])

  useEffect(() => {
    if (!username || !annoSelezionato || !cartellaSelezionata) { setFiles([]); return }
    setLoading(true)
    api.documenti.list({ username, anno: annoSelezionato, cartella: cartellaSelezionata })
      .then((r) => { setFiles((r.files ?? []) as unknown as FileItem[]); setPage(1); clearSelected() })
      .catch(() => toast.error('Errore caricamento file'))
      .finally(() => setLoading(false))
  }, [username, annoSelezionato, cartellaSelezionata, clearSelected])

  async function handleTogglePreferito(filePath: string, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      const r = await api.preferiti.toggle(filePath)
      setFiles((fs) => fs.map((f) => f.key === filePath ? { ...f, isPreferito: r.isPreferito, stato: r.isPreferito ? 'preferito' : 'nuovo' } : f))
      toast.success(r.isPreferito ? 'Aggiunto ai preferiti' : 'Rimosso dai preferiti')
    } catch { toast.error('Errore') }
  }

  async function handleDownload(key: string, nome: string) {
    try {
      const res = await fetch(`/api/documenti/download?key=${encodeURIComponent(key)}`)
      if (!res.ok) throw new Error('Errore download')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = nome
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setFiles((fs) => fs.map((f) => f.key === key ? { ...f, stato: 'scaricato' } : f))
      toast.success(`Download: ${nome}`)
    } catch { toast.error('Errore download') }
  }

  async function handleDownloadZip(keys: string[], zipName: string) {
    try {
      const res = await fetch('/api/documenti/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys, zipName }),
      })
      if (!res.ok) throw new Error('Errore ZIP')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = zipName
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`ZIP scaricato: ${zipName}`)
    } catch { toast.error('Errore creazione ZIP') }
  }

  if (r2Error) return (
    <Card><CardContent className="py-12 text-center">
      <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
      <p className="text-slate-700 font-medium mb-1">Cloudflare R2 non configurato</p>
      <p className="text-sm text-slate-500">Lo studio deve ancora configurare lo storage dei documenti. Riprova piu tardi.</p>
    </CardContent></Card>
  )

  if (loading && !annoSelezionato) return (<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>)

  if (anni.length === 0) return (
    <Card><CardContent className="py-12 text-center">
      <Inbox className="h-12 w-12 text-slate-300 mx-auto mb-3" />
      <p className="text-slate-700 font-medium mb-1">Nessun documento disponibile</p>
      <p className="text-sm text-slate-500">Lo studio carichera presto i tuoi documenti.</p>
    </CardContent></Card>
  )

  const totalPages = Math.ceil(files.length / PAGE_SIZE)
  const start = (page - 1) * PAGE_SIZE
  const end = Math.min(start + PAGE_SIZE, files.length)
  const pageFiles = files.slice(start, end)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {anni.map((a) => (
          <button key={a} onClick={() => setAnno(a)} className={cn('px-4 py-2 rounded-lg text-sm font-medium border transition-colors', annoSelezionato === a ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50')}>{a}</button>
        ))}
      </div>
      {cartelle.length > 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cartelle.map((c) => {
            const active = cartellaSelezionata === c
            return (
              <button key={c} onClick={() => setCartella(c)} className={cn('p-4 rounded-xl border text-left transition-all', active ? 'border-emerald-500 bg-gradient-to-br from-emerald-50 to-white shadow-md ring-2 ring-emerald-100' : 'border-slate-200 bg-white hover:border-emerald-300 hover:shadow-sm')}>
                <div className="flex items-center gap-2 mb-2">
                  <FolderOpen className={cn('h-5 w-5', active ? 'text-emerald-600' : 'text-slate-400')} />
                  <span className="font-bold text-slate-900">{c}</span>
                </div>
                {active && <div className="text-xs font-semibold text-emerald-700 bg-emerald-100 rounded px-2 py-1 inline-block">Aperta</div>}
              </button>
            )
          })}
        </div>
      )}
      {annoSelezionato && cartellaSelezionata && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="bg-gradient-to-r from-emerald-600 to-emerald-800 text-white text-sm font-bold px-3 py-1 rounded">{cartellaSelezionata}</span>
              <span className="text-sm text-slate-500">{files.length} file - {formatBytes(files.reduce((s, f) => s + f.size, 0))}</span>
            </div>
            <div className="flex items-center gap-2">
              {selectedFiles.size > 0 ? (
                <Button size="sm" onClick={() => handleDownloadZip(Array.from(selectedFiles), `selezionati_${cartellaSelezionata}_${annoSelezionato}.zip`)}>
                  <Package className="h-3.5 w-3.5 mr-1.5" /> Scarica selezione ({selectedFiles.size})
                </Button>
              ) : files.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => handleDownloadZip(files.map((f) => f.key), `${cartellaSelezionata}_${annoSelezionato}.zip`)}>
                  <Package className="h-3.5 w-3.5 mr-1.5" /> Scarica tutto (ZIP)
                </Button>
              )}
            </div>
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span>Nuovo</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span>Visto</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>Scaricato</span>
            <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-500 fill-amber-500" />Preferito</span>
          </div>
          {files.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-slate-500"><Folder className="h-10 w-10 mx-auto mb-2 text-slate-300" />Cartella vuota</CardContent></Card>
          ) : (
            <>
              <div className="space-y-1.5">
                {pageFiles.map((f) => {
                  const icon = ottieniIconaFile(f.nome)
                  const statoCfg = STATO_CONFIG[f.stato]
                  const canPreview = canPreviewFile(f.nome)
                  return (
                    <div key={f.key} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-emerald-300 hover:shadow-sm transition-all">
                      <Checkbox checked={selectedFiles.has(f.key)} onCheckedChange={() => toggleSelected(f.key)} />
                      <button onClick={(e) => handleTogglePreferito(f.key, e)} className="flex-shrink-0 p-1 hover:bg-amber-50 rounded" title={f.isPreferito ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}>
                        {f.isPreferito ? <Star className="h-4 w-4 text-amber-500 fill-amber-500" /> : <StarOff className="h-4 w-4 text-slate-300" />}
                      </button>
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: icon.bg, color: icon.fg }}>{icon.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold" style={{ color: statoCfg.color }}>[{statoCfg.icon}]</span>
                          <p className="font-medium text-slate-900 truncate">{f.nome}</p>
                        </div>
                        <p className="text-xs text-slate-500">{f.sizeStr}{f.lastModified && <span className="ml-2">- {formatDateShort(f.lastModified)}</span>}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {canPreview && <Button variant="outline" size="sm" onClick={() => setPreviewFile(f)}><Eye className="h-3.5 w-3.5 mr-1" /> Anteprima</Button>}
                        <Button variant="outline" size="sm" onClick={() => handleDownload(f.key, f.nome)}><Download className="h-3.5 w-3.5 mr-1" /> Scarica</Button>
                      </div>
                    </div>
                  )
                })}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4 mr-1" /> Precedente</Button>
                  <span className="text-sm text-slate-600">Pagina {page} di {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Successiva <ChevronRight className="h-4 w-4 ml-1" /></Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
