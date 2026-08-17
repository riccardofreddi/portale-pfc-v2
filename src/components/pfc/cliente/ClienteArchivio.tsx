'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
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
const STATO_CONFIG: Record<string, { icon: string; label: string; dotClass: string }> = {
  preferito: { icon: '⭐', label: 'Preferito', dotClass: 'status-dot-downloaded' },
  nuovo: { icon: '🔴', label: 'Nuovo', dotClass: 'status-dot-new' },
  visto: { icon: '🔵', label: 'Visto', dotClass: 'status-dot-seen' },
  scaricato: { icon: '🞢', label: 'Scaricato', dotClass: 'status-dot-downloaded' },
}

interface CartellaMeta { nome: string; nFiles: number; nNuovi: number }
interface SearchResult {
  nome: string; key: string; anno: string; cartella: string; sizeStr: string;
  stato: 'preferito' | 'nuovo' | 'visto' | 'scaricato'; isPreferito: boolean;
}

const globalCache = {
  owner: null as string | null,
  anni: null as string[] | null,
  cartelle: {} as Record<string, CartellaMeta[]>,
  files: {} as Record<string, FileItem[]>,
}

export function clearArchivioGlobalCache() {
  globalCache.owner = null
  globalCache.anni = null
  globalCache.cartelle = {}
  globalCache.files = {}
}

export function ClienteArchivio() {
  const { user, annoSelezionato, cartellaSelezionata, setAnno, setCartella, previewFile, setPreviewFile, selectedFiles, toggleSelected, clearSelected } = usePfcStore()
  const [anni, setAnni] = useState<string[]>([])
  const [cartelle, setCartelle] = useState<CartellaMeta[]>([])
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingCartelle, setLoadingCartelle] = useState(false)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [page, setPage] = useState(1)
  const [r2Error, setR2Error] = useState(false)
  const [zipping, setZipping] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef<NodeJS.Timeout | null>(null)

  const lastFolderNavRef = useRef<string>('')

  const username = user?.username ?? ''

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (searchQuery.trim().length < 2) {
      setTimeout(() => { setSearchResults([]); setSearching(false) }, 0)
      return
    }
    setTimeout(() => setSearching(true), 0)
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await api.ricerca(searchQuery.trim(), username)
        setSearchResults(r.results as unknown as SearchResult[])
      } catch { toast.error('Errore ricerca'); setSearchResults([]) }
      finally { setSearching(false) }
    }, 300)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [searchQuery, username])

  const loadFiles = useCallback(async (anno: string, cartella: string, force = false) => {
    const cacheKey = `${anno}::${cartella}`
    if (!force && globalCache.owner === username && globalCache.files[cacheKey]) {
      setFiles(globalCache.files[cacheKey]); setPage(1); clearSelected(); return
    }
    setLoadingFiles(true)
    try {
      const r = await api.documenti.list({ username, anno, cartella })
      const data = (r.files ?? []) as unknown as FileItem[]
      if (globalCache.owner === username) globalCache.files[cacheKey] = data
      setFiles(data); setPage(1); clearSelected()
    } catch { toast.error('Errore caricamento file') }
    finally { setLoadingFiles(false) }
  }, [username, clearSelected])

  const loadCartelle = useCallback(async (anno: string, cartellaTarget?: string | null, force = false) => {
    if (!force && globalCache.owner === username && globalCache.cartelle[anno]) {
      const carts = globalCache.cartelle[anno]
      setCartelle(carts)
      const target = cartellaTarget ?? (carts.length > 0 ? carts[0].nome : null)
      if (target) { lastFolderNavRef.current = `${anno}::${target}`; setCartella(target); await loadFiles(anno, target) }
      else { setCartella(null); setFiles([]) }
      return
    }
    setLoadingCartelle(true)
    try {
      const r = await api.documenti.list({ username, anno })
      const carts = (r.cartelle ?? []) as unknown as CartellaMeta[]
      if (globalCache.owner === username) globalCache.cartelle[anno] = carts
      setCartelle(carts)
      const target = cartellaTarget ?? (carts.length > 0 ? carts[0].nome : null)
      if (target) { lastFolderNavRef.current = `${anno}::${target}`; setCartella(target); await loadFiles(anno, target, force) }
      else { setCartella(null); setFiles([]) }
    } catch { toast.error('Errore caricamento cartelle') }
    finally { setLoadingCartelle(false) }
  }, [username, setCartella, loadFiles])

  useEffect(() => {
    if (!username || !annoSelezionato || !cartellaSelezionata) return
    api.notifiche.segnaLette(['documento_nuovo'], annoSelezionato, cartellaSelezionata)
      .then(() => window.dispatchEvent(new Event('pfc-documenti-visti')))
      .catch(() => {})
  }, [username, annoSelezionato, cartellaSelezionata])

  useEffect(() => {
    if (!username) return
    if (globalCache.owner !== username) {
      globalCache.owner = username
      globalCache.anni = null
      globalCache.cartelle = {}
      globalCache.files = {}
    }
    let urlAnno: string | null = null
    let urlCartella: string | null = null
    try {
      const params = new URLSearchParams(window.location.search)
      urlAnno = params.get('anno')
      urlCartella = params.get('cartella')
    } catch {}
    if (globalCache.owner === username && globalCache.anni !== null) {
      const anniData = globalCache.anni
      setTimeout(() => {
        setAnni(anniData); setLoading(false)
        if (anniData.length > 0) {
          const anno = urlAnno ?? annoSelezionato ?? anniData[0]
          if (urlAnno) setAnno(urlAnno)
          else if (!annoSelezionato) setAnno(anno)
          loadCartelle(anno, urlCartella ?? cartellaSelezionata)
        }
        setTimeout(() => window.dispatchEvent(new Event('pfc-archivio-refresh')), 400)
      }, 0)
      return
    }
    setTimeout(() => setLoading(true), 0)
    api.documenti.list({ username })
      .then(async (r) => {
        if (r.r2NotConfigured) { setR2Error(true); setAnni([]); return }
        setR2Error(false)
        const anniData = r.anni ?? []
        globalCache.owner = username
        globalCache.anni = anniData
        setAnni(anniData)
        if (anniData.length > 0) {
          const anno = urlAnno ?? annoSelezionato ?? anniData[0]
          if (urlAnno) setAnno(urlAnno)
          else if (!annoSelezionato) setAnno(anno)
          await loadCartelle(anno, urlCartella ?? cartellaSelezionata)
        }
      })
      .catch(() => toast.error('Errore caricamento anni'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username])

  useEffect(() => {
    if (!username || !annoSelezionato || !cartellaSelezionata) return
    const cacheKey = `${annoSelezionato}::${cartellaSelezionata}`
    if (lastFolderNavRef.current === cacheKey) return
    lastFolderNavRef.current = cacheKey
    if (globalCache.owner === username && globalCache.files[cacheKey]) {
      const cached = globalCache.files[cacheKey]
      setTimeout(() => { setFiles(cached); setPage(1); clearSelected() }, 0)
      return
    }
    setTimeout(() => loadFiles(annoSelezionato, cartellaSelezionata), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, annoSelezionato, cartellaSelezionata, loadFiles])

  useEffect(() => {
    const onRefresh = () => { if (!annoSelezionato) return; loadCartelle(annoSelezionato, cartellaSelezionata, true) }
    window.addEventListener('pfc-archivio-refresh', onRefresh)
    return () => window.removeEventListener('pfc-archivio-refresh', onRefresh)
  }, [annoSelezionato, cartellaSelezionata, loadCartelle])

  useEffect(() => {
    const onDocumentoVisto = (e: Event) => {
      const detail = (e as CustomEvent<{ key?: string; stato?: 'visto' | 'scaricato' }>).detail
      if (!detail?.key || !detail.stato) return
      marcaFileLetto(detail.key, detail.stato)
    }
    window.addEventListener('pfc-documento-visto', onDocumentoVisto)
    return () => window.removeEventListener('pfc-documento-visto', onDocumentoVisto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, annoSelezionato, cartellaSelezionata])

  function handleAnnoClick(anno: string) {
    if (anno === annoSelezionato) return
    setAnno(anno); setFiles([]); setCartelle(globalCache.cartelle[anno] ?? []); loadCartelle(anno)
  }

  function handleCartellaClick(cartella: string) {
    if (cartella === cartellaSelezionata) return
    if (annoSelezionato) lastFolderNavRef.current = `${annoSelezionato}::${cartella}`
    setCartella(cartella)
    if (annoSelezionato) loadFiles(annoSelezionato, cartella)
  }

  function aggiornaBadgeCartella(nNuovi: number) {
    if (!annoSelezionato || !cartellaSelezionata) return
    setCartelle((prev) => prev.map((c) => (c.nome === cartellaSelezionata ? { ...c, nNuovi } : c)))
    const cached = globalCache.cartelle[annoSelezionato]
    if (cached) globalCache.cartelle[annoSelezionato] = cached.map((c) => (c.nome === cartellaSelezionata ? { ...c, nNuovi } : c))
  }

  function marcaFileLetto(key: string, stato: 'visto' | 'scaricato') {
    const nuovoStato = (f: FileItem): FileItem['stato'] => {
      if (f.key !== key) return f.stato
      if (stato === 'scaricato') return f.stato === 'preferito' ? 'preferito' : 'scaricato'
      return f.stato === 'preferito' || f.stato === 'scaricato' ? f.stato : 'visto'
    }
    const nextFiles = files.map((f) => ({ ...f, stato: nuovoStato(f) }))
    setFiles(nextFiles)
    aggiornaBadgeCartella(nextFiles.filter((f) => f.stato === 'nuovo').length)
    if (annoSelezionato && cartellaSelezionata) {
      const cacheKey = `${annoSelezionato}::${cartellaSelezionata}`
      if (globalCache.files[cacheKey]) globalCache.files[cacheKey] = globalCache.files[cacheKey].map((f) => ({ ...f, stato: nuovoStato(f) }))
    }
  }

  async function handleTogglePreferito(filePath: string, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      const r = await api.preferiti.toggle(filePath)
      setFiles((fs) => fs.map((f) => f.key === filePath ? { ...f, isPreferito: r.isPreferito, stato: r.isPreferito ? 'preferito' : 'nuovo' } : f))
      if (annoSelezionato && cartellaSelezionata) {
        const cacheKey = `${annoSelezionato}::${cartellaSelezionata}`
        if (globalCache.files[cacheKey]) globalCache.files[cacheKey] = globalCache.files[cacheKey].map((f) => f.key === filePath ? { ...f, isPreferito: r.isPreferito, stato: r.isPreferito ? 'preferito' : 'nuovo' } : f)
      }
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
      marcaFileLetto(key, 'scaricato')
      window.dispatchEvent(new Event('pfc-documenti-visti'))
      toast.success(`Download: ${nome}`)
    } catch { toast.error('Errore download') }
  }

  async function handleDownloadZip(keys: string[], zipName: string) {
    if (keys.length === 0) { toast.error('Nessun file da scaricare'); return }
    setZipping(true)
    const toastId = toast.loading(`Creazione ZIP di ${keys.length} file in corso...`)
    try {
      const res = await fetch('/api/documenti/zip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys, zipName }) })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || `Errore ${res.status}`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = zipName
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`ZIP scaricato: ${zipName} (${keys.length} file, ${formatBytes(blob.size)})`, { id: toastId })
      window.dispatchEvent(new Event('pfc-documenti-visti'))
      window.dispatchEvent(new Event('pfc-archivio-refresh'))
    } catch (err) {
      toast.error(`Errore ZIP: ${err instanceof Error ? err.message : 'errore sconosciuto'}`, { id: toastId })
    } finally { setZipping(false) }
  }

  if (r2Error) return (
    <Card className="border-0 shadow-none bg-transparent"><CardContent className="py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
        <AlertCircle className="h-8 w-8 text-amber-500" />
      </div>
      <p className="text-slate-800 font-semibold text-base mb-1">Storage non configurato</p>
      <p className="text-sm text-slate-500 max-w-xs mx-auto">Lo studio deve ancora configurare l'archivio documenti. Contattalo per maggiori informazioni.</p>
    </CardContent></Card>
  )

  if (loading) return (
    <div className="space-y-4 py-2">
      <div className="skeleton-shimmer h-10 w-full" />
      <div className="flex gap-2">
        {[1,2,3].map(i => <div key={i} className="skeleton-shimmer h-9 w-16 rounded-lg" />)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1,2,3].map(i => <div key={i} className="skeleton-shimmer h-24 rounded-xl" />)}
      </div>
    </div>
  )

  if (anni.length === 0) return (
    <Card className="border-0 shadow-none bg-transparent"><CardContent className="py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
        <Inbox className="h-8 w-8 text-slate-400" />
      </div>
      <p className="text-slate-800 font-semibold text-base mb-1">Nessun documento ancora</p>
      <p className="text-sm text-slate-500 max-w-xs mx-auto">Lo studio sta preparando il tuo archivio. Riceverai una notifica appena saranno disponibili.</p>
    </CardContent></Card>
  )

  const totalPages = Math.ceil(files.length / PAGE_SIZE)
  const start = (page - 1) * PAGE_SIZE
  const end = Math.min(start + PAGE_SIZE, files.length)
  const pageFiles = files.slice(start, end)

  return (
    <div className="space-y-4">
      <div className="relative group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cerca nei documenti..."
          className="pl-9 pr-10 h-10 text-base sm:text-sm bg-white border-slate-200 focus:border-emerald-400 focus:ring-emerald-400/20 transition-all rounded-xl"
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-emerald-500" />}
        {searchQuery && !searching && (
          <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors" aria-label="Pulisci ricerca">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {searchQuery.trim().length >= 2 && (
        <div className="mt-4 space-y-3">
          {searching && searchResults.length === 0 ? (
            <div className="flex items-center gap-2 px-1 text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
              <span className="text-xs">Ricerca in corso&hellip;</span>
            </div>
          ) : searchResults.length === 0 ? (
            <Card className="border-0 shadow-none bg-transparent"><CardContent className="py-12 text-center anim-fade-in">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <Inbox className="h-7 w-7 text-slate-400" />
              </div>
              <p className="text-slate-700 font-semibold text-sm mb-0.5">Nessun risultato</p>
              <p className="text-xs text-slate-400">Nessun documento corrisponde a &quot;{searchQuery}&quot;</p>
            </CardContent></Card>
          ) : (
            <div key={searchQuery} className="space-y-3 anim-fade-in">
              <p className="text-xs font-semibold text-emerald-700 px-1">{`${searchResults.length} ${searchResults.length === 1 ? 'risultato' : 'risultati'}`} per &quot;{searchQuery}&quot;</p>
              <div className="space-y-1.5 px-1">
                {searchResults.map((r, idx) => {
                  const icon = ottieniIconaFile(r.nome)
                  const statoCfg = STATO_CONFIG[r.stato]
                  const canPreview = canPreviewFile(r.nome)
                  const isPreviewing = previewFile?.key === r.key
                  const ext = (r.nome.split('.').pop() ?? '').toUpperCase()
                  return (
                    <div
                      key={r.key}
                      className={cn(
                        'anim-file-enter file-card flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-white border border-slate-200/80 rounded-xl',
                        isPreviewing && 'file-card-previewing',
                        !isPreviewing && r.stato === 'nuovo' && 'file-card-nuovo'
                      )}
                      style={{ animationDelay: `${idx * 40}ms` }}
                    >
                      <button onClick={(e) => { e.stopPropagation(); handleTogglePreferitoSearch(r.key) }} className="flex-shrink-0 p-1 hover:bg-amber-50 rounded-lg transition-colors">
                        {r.isPreferito ? <Star className="h-4 w-4 text-amber-500 fill-amber-500 star-animated" /> : <StarOff className="h-4 w-4 text-slate-300 hover:text-amber-400 transition-colors" />}
                      </button>
                      <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-xs sm:text-sm font-bold tracking-wide" style={{ background: icon.bg, color: icon.fg }}>{icon.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={statoCfg.dotClass} title={statoCfg.label} />
                          <p className="font-medium text-slate-900 truncate text-xs sm:text-sm">{r.nome}</p>
                          <span className="file-ext-badge" style={{ background: icon.bg, color: icon.fg }}>{ext}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 pl-[18px]">
                          <span className="text-[10px] sm:text-xs text-slate-400">{r.anno} · {r.cartella} · {r.sizeStr}</span>
                          {isPreviewing && (
                            <span className="previewing-badge ml-auto">
                              <Eye className="h-3 w-3" />
                              <span className="hidden sm:inline">Anteprima</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="file-actions flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                        {canPreview && <Button variant="ghost" size="sm" className="h-8 w-8 p-0 sm:h-8 sm:w-auto sm:px-2.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50" onClick={() => setPreviewFile({ ...r, size: 0, lastModified: null } as unknown as FileItem)}><Eye className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline text-xs">Anteprima</span></Button>}
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 sm:h-8 sm:w-auto sm:px-2.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50" onClick={() => handleDownload(r.key, r.nome)}><Download className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline text-xs">Scarica</span></Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {searchQuery.trim().length < 2 && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex-shrink-0">Archivio</span>
            <ChevronRight className="h-3 w-3 text-slate-300 flex-shrink-0" />
            <div className="flex flex-wrap gap-1.5">
              {anni.map((a) => (
                <button
                  key={a}
                  onClick={() => handleAnnoClick(a)}
                  className={cn(
                    'px-3 py-1 sm:px-4 sm:py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200',
                    annoSelezionato === a
                      ? 'bg-emerald-600 text-white shadow-[0_2px_8px_rgba(5,150,105,0.3)]'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50/50'
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {loadingCartelle ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1,2,3].map(i => <div key={i} className="skeleton-shimmer h-[88px] rounded-xl" />)}
            </div>
          ) : cartelle.length > 1 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
              {cartelle.map((c, idx) => {
                const active = cartellaSelezionata === c.nome
                return (
                  <button
                    key={c.nome}
                    onClick={() => handleCartellaClick(c.nome)}
                    className={cn(
                      'anim-folder-enter p-3.5 sm:p-4 rounded-xl border text-left transition-all duration-300 group',
                      active
                        ? 'folder-card-active'
                        : 'bg-white/80 border-slate-200/80 hover:border-emerald-300/80 hover:shadow-[0_4px_12px_rgba(0,0,0,0.05)]'
                    )}
                    style={{ animationDelay: `${idx * 60}ms` }}
                  >
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <div className={cn(
                        'w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center transition-all duration-300 flex-shrink-0',
                        active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-500'
                      )}>
                        {active ? <FolderOpen className="h-5 w-5" /> : <Folder className="h-4.5 w-4.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn('font-bold text-sm sm:text-base truncate transition-colors duration-300', active ? 'text-white' : 'text-slate-900')}>{c.nome}</span>
                          {c.nNuovi > 0 && (
                            <span className="flex-shrink-0 text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white shadow-sm">+{c.nNuovi} {c.nNuovi === 1 ? 'nuovo' : 'nuovi'}</span>
                          )}
                        </div>
                        <span className={cn('text-[11px] sm:text-xs transition-colors duration-300', active ? 'text-white/70' : 'text-slate-500')}>{c.nFiles} documento{c.nFiles !== 1 ? 'i' : ''}</span>
                      </div>
                      {active && (
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                          <ChevronRight className="h-3.5 w-3.5 text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                )
              })}
              </div>
            ) : cartelle.length === 1 && !annoSelezionato ? null : null}

          {annoSelezionato && cartellaSelezionata && (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Archivio</span>
                <ChevronRight className="h-3 w-3 text-slate-300" />
                <span className="text-xs font-semibold text-emerald-600">{annoSelezionato}</span>
                <ChevronRight className="h-3 w-3 text-slate-300" />
                <span className="text-xs font-semibold text-slate-800">{cartellaSelezionata}</span>
                {!loadingFiles && files.length > 0 && (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 font-medium tabular-nums">
                      {files.length} doc · {formatBytes(files.reduce((s, f) => s + f.size, 0))}
                      {files.filter(f => f.stato === 'nuovo').length > 0 && (
                        <span className="ml-1.5 inline-flex items-center gap-1 text-red-500 font-semibold">
                          <span className="status-dot-new" style={{ width: '6px', height: '6px' }} />
                          {files.filter(f => f.stato === 'nuovo').length} nuovi
                        </span>
                      )}
                    </span>
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 text-[11px]" onClick={() => handleDownloadZip(files.map((f) => f.key), `archivio.zip`)} disabled={zipping}>
                      <Package className="h-3 w-3 mr-1" />{zipping ? '...' : 'ZIP tutti'}
                    </Button>
                  </div>
                )}
              </div>

              {!loadingFiles && files.length > 0 && (
                <div className="flex items-center gap-3 sm:gap-4 px-1">
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-400"><span className="status-dot-new" /><span className="font-medium">Nuovo</span></span>
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-400"><span className="status-dot-seen" /><span className="font-medium">Visto</span></span>
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-400"><span className="status-dot-downloaded" /><span className="font-medium">Scaricato</span></span>
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-400"><Star className="h-3 w-3 text-amber-400 fill-amber-400" /><span className="font-medium">Preferito</span></span>
                </div>
              )}

              {loadingFiles ? (
                <div className="space-y-2">
                  {[1,2,3,4,5].map(i => <div key={i} className="skeleton-shimmer h-14 rounded-xl" />)}
                </div>
              ) : files.length === 0 ? (
                <Card className="border-0 shadow-none bg-transparent"><CardContent className="py-12 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <Folder className="h-7 w-7 text-slate-400" />
                  </div>
                  <p className="text-slate-700 font-semibold text-sm mb-0.5">Cartella vuota</p>
                  <p className="text-xs text-slate-400">Nessun documento in questa cartella.</p>
                </CardContent></Card>
              ) : (
                <>
                  <div className="space-y-1.5">

                    {pageFiles.map((f, idx) => {
                      const icon = ottieniIconaFile(f.nome)
                      const statoCfg = STATO_CONFIG[f.stato]
                      const canPreview = canPreviewFile(f.nome)
                      const isPreviewing = previewFile?.key === f.key
                      const isSelected = selectedFiles.has(f.key)
                      const ext = (f.nome.split('.').pop() ?? '').toUpperCase()
                      return (
                        <div
                          key={f.key}
                          className={cn(
                            'file-card anim-file-enter flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-white border border-slate-200/80 rounded-xl',
                            isPreviewing && 'file-card-previewing',
                            isSelected && !isPreviewing && 'file-card-selected',
                            !isPreviewing && f.stato === 'nuovo' && 'file-card-nuovo'
                          )}
                          style={{ animationDelay: `${idx * 40}ms` }}
                        >
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleSelected(f.key)} className="flex-shrink-0" />
                          <button onClick={(e) => handleTogglePreferito(f.key, e)} className="flex-shrink-0 p-1 hover:bg-amber-50 rounded-lg transition-colors">
                            {f.isPreferito ? <Star className="h-4 w-4 text-amber-500 fill-amber-500 star-animated" /> : <StarOff className="h-4 w-4 text-slate-300 hover:text-amber-400 transition-colors" />}
                          </button>
                          <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center text-xs sm:text-sm font-bold tracking-wide" style={{ background: icon.bg, color: icon.fg }}>{icon.icon}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={statoCfg.dotClass} title={statoCfg.label} />
                              <p className="font-medium text-slate-900 truncate text-xs sm:text-sm">{f.nome}</p>
                              <span className="file-ext-badge" style={{ background: icon.bg, color: icon.fg }}>{ext}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 pl-[18px]">
                              <span className="text-[10px] sm:text-xs text-slate-400">{f.sizeStr}{f.lastModified && <span className="ml-1.5">· {formatDateShort(f.lastModified)}</span>}</span>
                              {isPreviewing && (
                                <span className="previewing-badge ml-auto">
                                  <Eye className="h-3 w-3" />
                                  <span className="hidden sm:inline">Anteprima</span>
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="file-actions flex items-center gap-1 flex-shrink-0">
                            {canPreview && (
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 sm:h-8 sm:w-auto sm:px-2.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50" onClick={() => { setPreviewFile(f); setFiles((fs) => fs.map((x) => x.key === f.key && x.stato !== 'scaricato' && x.stato !== 'preferito' ? { ...x, stato: 'visto' } : x)) }}>
                                <Eye className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline text-xs">Anteprima</span>
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 sm:h-8 sm:w-auto sm:px-2.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50" onClick={() => handleDownload(f.key, f.nome)}>
                              <Download className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline text-xs">Scarica</span>
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="h-8 text-xs rounded-lg">
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                          <button key={p} onClick={() => setPage(p)} className={cn('w-8 h-8 rounded-lg text-xs font-semibold transition-all', page === p ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100')}>
                            {p}
                          </button>
                        ))}
                      </div>
                      <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="h-8 text-xs rounded-lg">
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}

                  {selectedFiles.size > 0 && (
                    <div className="anim-slide-up fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-40">
                      <div className="flex items-center gap-3 bg-slate-900/90 backdrop-blur-xl text-white pl-4 pr-2 py-2 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.18)]">
                        <span className="text-sm font-medium">
                          <span className="tabular-nums font-bold">{selectedFiles.size}</span> selezionat{selectedFiles.size === 1 ? 'o' : 'i'}
                        </span>
                        <div className="w-px h-5 bg-white/20" />
                        <Button size="sm" className="h-8 text-xs bg-white text-slate-900 hover:bg-slate-100 rounded-xl font-semibold shadow-sm" onClick={() => handleDownloadZip(Array.from(selectedFiles), `selezionati.zip`)} disabled={zipping}>
                          <Package className="h-3.5 w-3.5 mr-1.5" />
                          {zipping ? 'Creazione ZIP...' : `Scarica ZIP`}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-white/60 hover:text-white hover:bg-white/10 rounded-xl" onClick={clearSelected}>
                          ✕
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
    </div>
  )
}
