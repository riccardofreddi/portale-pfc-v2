'use client'

import { useEffect, useState, useRef } from 'react'
import { usePfcStore, type FileItem } from '@/store/pfc'
import { api } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ottieniIconaFile, canPreviewFile, formatBytes, formatDateShort } from '@/lib/pfc-utils'
import { FolderOpen, Folder, Download, Eye, Star, StarOff, Package, Loader2, ChevronLeft, ChevronRight, Inbox, AlertCircle, Search, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 10
const STATO_CONFIG: Record<string, { icon: string; label: string }> = {
  preferito: { icon: '⭐', label: 'Preferito' },
  nuovo: { icon: '🔴', label: 'Nuovo' },
  visto: { icon: '🔵', label: 'Visto' },
  scaricato: { icon: '🟢', label: 'Scaricato' },
}

interface CartellaMeta { nome: string; nFiles: number; nNuovi: number }
interface SearchResult {
  nome: string; key: string; anno: string; cartella: string; sizeStr: string;
  stato: 'preferito' | 'nuovo' | 'visto' | 'scaricato'; isPreferito: boolean;
}

export function ClienteArchivio() {
  const { user, annoSelezionato, cartellaSelezionata, setAnno, setCartella, setPreviewFile, selectedFiles, toggleSelected, clearSelected } = usePfcStore()
  const [anni, setAnni] = useState<string[]>([])
  const [cartelle, setCartelle] = useState<CartellaMeta[]>([])
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [r2Error, setR2Error] = useState(false)
  const [zipping, setZipping] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef<NodeJS.Timeout | null>(null)

  const username = user?.username ?? ''

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (searchQuery.trim().length < 2) { setSearchResults([]); setSearching(false); return }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await api.ricerca(searchQuery.trim(), username)
        setSearchResults(r.results as unknown as SearchResult[])
      } catch { toast.error('Errore ricerca'); setSearchResults([]) }
      finally { setSearching(false) }
    }, 300)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [searchQuery, username])

  useEffect(() => {
    if (!username) return
    setLoading(true)
    api.documenti.list({ username })
      .then((r) => {
        if (r.r2NotConfigured) { setR2Error(true); setAnni([]); return }
        setR2Error(false); setAnni(r.anni ?? [])
        if ((r.anni ?? []).length > 0 && !annoSelezionato) setAnno(r.anni![0])
      })
      .catch(() => toast.error('Errore caricamento anni'))
      .finally(() => setLoading(false))
  }, [username, annoSelezionato, setAnno])

  useEffect(() => {
    if (!username || !annoSelezionato) { setCartelle([]); return }
    api.documenti.list({ username, anno: annoSelezionato })
      .then((r) => {
        const carts = (r.cartelle ?? []) as unknown as CartellaMeta[]
        setCartelle(carts)
        if (carts.length > 0 && !cartellaSelezionata) setCartella(carts[0].nome)
        else if (carts.length === 0) setCartella(null)
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

  async function handleTogglePreferitoSearch(filePath: string) {
    try {
      const r = await api.preferiti.toggle(filePath)
      setSearchResults((rs) => rs.map((x) => x.key === filePath ? { ...x, isPreferito: r.isPreferito, stato: r.isPreferito ? 'preferito' : 'nuovo' } : x))
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
      const res = await fetch('/api/documenti/zip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys, zipName }) })
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
      <p className="text-sm text-slate-500">Lo studio deve ancora configurare lo storage dei documenti.</p>
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
      {/* SEARCHBAR */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cerca nei documenti..."
          className="pl-9 pr-10 h-9"
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />}
        {searchQuery && !searching && (
          <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* RISULTATI RICERCA */}
      {searchQuery.trim().length >= 2 && (
        <div className="space-y-3">
          {searchResults.length === 0 && !searching ? (
            <Card><CardContent className="py-8 text-center text-slate-500">
              <p className="font-medium">🔍 Nessun documento trovato per "{searchQuery}"</p>
            </CardContent></Card>
          ) : (
            <>
              <div className="bg-emerald-50 border border-emerald-300 rounded-lg px-3 py-1.5 text-xs sm:text-sm text-emerald-800 font-semibold">
                🔍 {searchResults.length} risultati per "{searchQuery}"
              </div>
              <div className="space-y-2">
                {searchResults.map((r) => {
                  const icon = ottieniIconaFile(r.nome)
                  const statoCfg = STATO_CONFIG[r.stato]
                  const canPreview = canPreviewFile(r.nome)
                  return (
                    <div key={r.key} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-white border border-slate-200 rounded-lg hover:border-emerald-300 transition-all">
                      <button onClick={(e) => { e.stopPropagation(); handleTogglePreferitoSearch(r.key) }} className="flex-shrink-0 p-1 hover:bg-amber-50 rounded">
                        {r.isPreferito ? <Star className="h-4 w-4 text-amber-500 fill-amber-500" /> : <StarOff className="h-4 w-4 text-slate-300" />}
                      </button>
                      <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-base sm:text-xl" style={{ background: icon.bg, color: icon.fg }}>{icon.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <span className="text-sm sm:text-base leading-none">{statoCfg.icon}</span>
                          <p className="font-medium text-slate-900 truncate text-xs sm:text-sm">{r.nome}</p>
                        </div>
                        <p className="text-[10px] sm:text-xs text-slate-500 truncate">{r.anno} · {r.cartella} · {r.sizeStr}</p>
                      </div>
                      <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                        {canPreview && <Button variant="outline" size="sm" className="h-7 w-7 p-0 sm:h-8 sm:w-auto sm:px-2" onClick={() => setPreviewFile({ ...r, size: 0, lastModified: null } as unknown as FileItem)}><Eye className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Anteprima</span></Button>}
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0 sm:h-8 sm:w-auto sm:px-2" onClick={() => handleDownload(r.key, r.nome)}><Download className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Scarica</span></Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* VISTA ARCHIVIO NORMALE */}
      {searchQuery.trim().length < 2 && (
        <>
          <div className="flex flex-wrap gap-2">
            {anni.map((a) => (
              <button key={a} onClick={() => setAnno(a)} className={cn('px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium border transition-colors', annoSelezionato === a ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50')}>{a}</button>
            ))}
          </div>

          {cartelle.length > 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              {cartelle.map((c) => {
                const active = cartellaSelezionata === c.nome
                return (
                  <button key={c.nome} onClick={() => setCartella(c.nome)} className={cn('p-3 sm:p-4 rounded-xl border text-left transition-all', active ? 'border-emerald-500 bg-gradient-to-br from-emerald-50 to-white shadow-md ring-2 ring-emerald-100' : 'border-slate-200 bg-white hover:border-emerald-300 hover:shadow-sm')}>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <FolderOpen className={cn('h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0', active ? 'text-emerald-600' : 'text-slate-400')} />
                      <span className="font-bold text-slate-900 text-sm sm:text-base">{c.nome}</span>
                      {c.nNuovi > 0 && <span className="bg-red-100 text-red-700 text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded-full">+{c.nNuovi}</span>}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] sm:text-xs text-slate-500">{c.nFiles} file</span>
                      {active && <span className="text-[10px] sm:text-xs font-semibold text-emerald-700 bg-emerald-100 rounded px-1.5 py-0.5">Aperta</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {annoSelezionato && cartellaSelezionata && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="bg-gradient-to-r from-emerald-600 to-emerald-800 text-white text-xs sm:text-sm font-bold px-2 py-1 sm:px-3 rounded">{cartellaSelezionata}</span>
                  <span className="text-xs sm:text-sm text-slate-500">{files.length} file · {formatBytes(files.reduce((s, f) => s + f.size, 0))}</span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedFiles.size > 0 ? (
                    <Button size="sm" className="h-7 text-xs" onClick={() => handleDownloadZip(Array.from(selectedFiles), `selezionati.zip`)}>
                      <Package className="h-3 w-3 mr-1" /> ZIP ({selectedFiles.size})
                    </Button>
                  ) : files.length > 0 && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleDownloadZip(files.map((f) => f.key), `archivio.zip`)}>
                      <Package className="h-3 w-3 mr-1" /> ZIP tutti
                    </Button>
                  )}
                </div>
              </div>

              <div className="text-[10px] sm:text-xs text-slate-500 flex items-center gap-2 sm:gap-3">
                <span>🔴 Nuovo</span><span>🔵 Visto</span><span>🟢 Scaricato</span><span>⭐ Pref.</span>
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
                        <div key={f.key} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-white border border-slate-200 rounded-lg hover:border-emerald-300 transition-all">
                          <Checkbox checked={selectedFiles.has(f.key)} onCheckedChange={() => toggleSelected(f.key)} className="flex-shrink-0" />
                          <button onClick={(e) => handleTogglePreferito(f.key, e)} className="flex-shrink-0 p-1 hover:bg-amber-50 rounded">
                            {f.isPreferito ? <Star className="h-4 w-4 text-amber-500 fill-amber-500" /> : <StarOff className="h-4 w-4 text-slate-300" />}
                          </button>
                          <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-base sm:text-xl" style={{ background: icon.bg, color: icon.fg }}>{icon.icon}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <span className="text-sm sm:text-base leading-none">{statoCfg.icon}</span>
                              <p className="font-medium text-slate-900 truncate text-xs sm:text-sm">{f.nome}</p>
                            </div>
                            <p className="text-[10px] sm:text-xs text-slate-500">{f.sizeStr}{f.lastModified && <span className="ml-2">· {formatDateShort(f.lastModified)}</span>}</p>
                          </div>
                          <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                            {canPreview && (
                              <Button variant="outline" size="sm" className="h-7 w-7 p-0 sm:h-8 sm:w-auto sm:px-2" onClick={() => { setPreviewFile(f); setFiles((fs) => fs.map((x) => x.key === f.key && x.stato !== 'scaricato' && x.stato !== 'preferito' ? { ...x, stato: 'visto' } : x)) }}>
                                <Eye className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Anteprima</span>
                              </Button>
                            )}
                            <Button variant="outline" size="sm" className="h-7 w-7 p-0 sm:h-8 sm:w-auto sm:px-2" onClick={() => handleDownload(f.key, f.nome)}>
                              <Download className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Scarica</span>
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between">
                      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="h-7 text-xs"><ChevronLeft className="h-3.5 w-3.5 mr-1" /> Prec</Button>
                      <span className="text-xs text-slate-600">Pag {page} di {totalPages}</span>
                      <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="h-7 text-xs">Succ <ChevronRight className="h-3.5 w-3.5 ml-1" /></Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
