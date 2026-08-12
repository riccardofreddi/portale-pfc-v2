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

// Cache globale per la sessione (azzerata automaticamente al cambio utente)
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
  const { user, annoSelezionato, cartellaSelezionata, setAnno, setCartella, setPreviewFile, selectedFiles, toggleSelected, clearSelected } = usePfcStore()
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

  // Ultima cartella già caricata da INIT / click UI: usata dall'effect di
  // "navigazione esterna" per evitare ricariche doppie (formato `anno::cartella`).
  const lastFolderNavRef = useRef<string>('')

  const username = user?.username ?? ''

  // ─── RICERCA ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (searchQuery.trim().length < 2) {
      // setTimeout(0): evita setState sincrono nel corpo dell'effect (react-hooks/set-state-in-effect)
      setTimeout(() => {
        setSearchResults([])
        setSearching(false)
      }, 0)
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

  // ─── LOAD FILES per cartella (con cache) ────────────────────────────────────
  const loadFiles = useCallback(async (anno: string, cartella: string, force = false) => {
    const cacheKey = `${anno}::${cartella}`
    if (!force && globalCache.owner === username && globalCache.files[cacheKey]) {
      setFiles(globalCache.files[cacheKey])
      setPage(1)
      clearSelected()
      return
    }
    setLoadingFiles(true)
    try {
      const r = await api.documenti.list({ username, anno, cartella })
      const data = (r.files ?? []) as unknown as FileItem[]
      if (globalCache.owner === username) {
        globalCache.files[cacheKey] = data
      }
      setFiles(data)
      setPage(1)
      clearSelected()
    } catch { toast.error('Errore caricamento file') }
    finally { setLoadingFiles(false) }
  }, [username, clearSelected])

  // ─── LOAD CARTELLE per anno (con cache) ─────────────────────────────────────
  const loadCartelle = useCallback(async (anno: string, cartellaTarget?: string | null, force = false) => {
    if (!force && globalCache.owner === username && globalCache.cartelle[anno]) {
      const carts = globalCache.cartelle[anno]
      setCartelle(carts)
      const target = cartellaTarget ?? (carts.length > 0 ? carts[0].nome : null)
      if (target) {
        lastFolderNavRef.current = `${anno}::${target}`
        setCartella(target)
        await loadFiles(anno, target)
      } else {
        setCartella(null)
        setFiles([])
      }
      return
    }
    setLoadingCartelle(true)
    try {
      const r = await api.documenti.list({ username, anno })
      const carts = (r.cartelle ?? []) as unknown as CartellaMeta[]
      if (globalCache.owner === username) {
        globalCache.cartelle[anno] = carts
      }
      setCartelle(carts)
      const target = cartellaTarget ?? (carts.length > 0 ? carts[0].nome : null)
      if (target) {
        lastFolderNavRef.current = `${anno}::${target}`
        setCartella(target)
        await loadFiles(anno, target, force)
      } else {
        setCartella(null)
        setFiles([])
      }
    } catch { toast.error('Errore caricamento cartelle') }
    finally { setLoadingCartelle(false) }
  }, [username, setCartella, loadFiles])

  // ─── INIT: carica anni (una volta sola per utente) ─────────────────────────
  useEffect(() => {
    if (!username) return

    // Resetta la cache globale se l'utente e cambiato rispetto a quello memorizzato
    if (globalCache.owner !== username) {
      globalCache.owner = username
      globalCache.anni = null
      globalCache.cartelle = {}
      globalCache.files = {}
    }

    // Apertura da notifica push (?tab=archivio&anno=...&cartella=...): usa come
    // anno/cartella iniziali quelli indicati nella URL, altrimenti lo store.
    let urlAnno: string | null = null
    let urlCartella: string | null = null
    try {
      const params = new URLSearchParams(window.location.search)
      urlAnno = params.get('anno')
      urlCartella = params.get('cartella')
    } catch {}

    // Se gia in cache per l'utente corrente, applica subito senza spinner
    if (globalCache.owner === username && globalCache.anni !== null) {
      const anniData = globalCache.anni
      // setTimeout(0): evita setState sincrono nel corpo dell'effect (react-hooks/set-state-in-effect)
      setTimeout(() => {
        setAnni(anniData)
        setLoading(false)
        if (anniData.length > 0) {
          const anno = urlAnno ?? annoSelezionato ?? anniData[0]
          if (urlAnno) setAnno(urlAnno)
          else if (!annoSelezionato) setAnno(anno)
          loadCartelle(anno, urlCartella ?? cartellaSelezionata)
        }
        // La cache può essere vecchia (es. nuovo file caricato dall'admin mentre
        // l'app era in background o su un'altra tab): ricarica con forza per
        // mostrare subito il badge "+N" e i nuovi documenti, senza spinner.
        setTimeout(() => {
          window.dispatchEvent(new Event('pfc-archivio-refresh'))
        }, 400)
      }, 0)
      return
    }

    // setTimeout(0): evita setState sincrono nel corpo dell'effect (react-hooks/set-state-in-effect)
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

  // ─── NAVIGAZIONE ESTERNA (notifica push / ?anno=&cartella= da URL o
  // OPEN_TAB del Service Worker) ────────────────────────────────────────────────
  // Quando anno e cartella arrivano dallo store senza passare dai pulsanti UI,
  // carica direttamente quella cartella. lastFolderNavRef (già valorizzato da
  // INIT / handleAnnoClick / handleCartellaClick) evita ricariche doppie.
  useEffect(() => {
    if (!username || !annoSelezionato || !cartellaSelezionata) return
    const cacheKey = `${annoSelezionato}::${cartellaSelezionata}`
    if (lastFolderNavRef.current === cacheKey) return
    lastFolderNavRef.current = cacheKey
    if (globalCache.owner === username && globalCache.files[cacheKey]) {
      const cached = globalCache.files[cacheKey]
      // setTimeout(0): evita setState sincrono nel corpo dell'effect (react-hooks/set-state-in-effect)
      setTimeout(() => {
        setFiles(cached)
        setPage(1)
        clearSelected()
      }, 0)
      return
    }
    setTimeout(() => loadFiles(annoSelezionato, cartellaSelezionata), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, annoSelezionato, cartellaSelezionata, loadFiles])

  // ─── REFRESH LIVE (push documento ricevuta con app già a video) ──────────────
  // ClienteArea dispatches 'pfc-archivio-refresh' quando arriva una notifica
  // documento / badge update mentre siamo sulla tab Archivio: ricarica cartelle
  // (badge +N) e file della cartella aperta BYPASSANDO la cache, così il nuovo
  // documento compare subito senza dover ricaricare la pagina.
  useEffect(() => {
    const onRefresh = () => {
      if (!annoSelezionato) return
      loadCartelle(annoSelezionato, cartellaSelezionata, true)
    }
    window.addEventListener('pfc-archivio-refresh', onRefresh)
    return () => window.removeEventListener('pfc-archivio-refresh', onRefresh)
  }, [annoSelezionato, cartellaSelezionata, loadCartelle])

  // ─── MARCA FILE VISTO/SCARICATO dall'esterno (PreviewModal) ────────────────
  // Quando il cliente apre l'anteprima o scarica dalla modale, ClienteArchivio
  // aggiorna subito lo stato locale dei file e il badge "+N" della cartella,
  // senza aspettare il prossimo fetch.
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

  // ─── HANDLERS cambio anno/cartella (istantanei se in cache) ─────────────────
  function handleAnnoClick(anno: string) {
    if (anno === annoSelezionato) return
    setAnno(anno)          // azzera cartellaSelezionata nello store
    setFiles([])
    setCartelle(globalCache.cartelle[anno] ?? [])
    loadCartelle(anno)
  }

  function handleCartellaClick(cartella: string) {
    if (cartella === cartellaSelezionata) return
    if (annoSelezionato) lastFolderNavRef.current = `${annoSelezionato}::${cartella}`
    setCartella(cartella)
    if (annoSelezionato) loadFiles(annoSelezionato, cartella)
  }

  // Ricalcola il badge "+N" della cartella corrente (stato locale + cache).
  // Usato quando un file passa da "nuovo" a "visto"/"scaricato".
  function aggiornaBadgeCartella(nNuovi: number) {
    if (!annoSelezionato || !cartellaSelezionata) return
    setCartelle((prev) => prev.map((c) => (c.nome === cartellaSelezionata ? { ...c, nNuovi } : c)))
    const cached = globalCache.cartelle[annoSelezionato]
    if (cached) {
      globalCache.cartelle[annoSelezionato] = cached.map((c) => (c.nome === cartellaSelezionata ? { ...c, nNuovi } : c))
    }
  }

  // Aggiorna lo stato locale di un file (visto/scaricato), ricalcola il badge
  // "+N" della cartella corrente e aggiorna la cache. Chiamata dal download
  // diretto e da PreviewModal (evento 'pfc-documento-visto').
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
      if (globalCache.files[cacheKey]) {
        globalCache.files[cacheKey] = globalCache.files[cacheKey].map((f) => ({ ...f, stato: nuovoStato(f) }))
      }
    }
  }

  // ─── PREFERITI ──────────────────────────────────────────────────────────────
  async function handleTogglePreferito(filePath: string, e: React.MouseEvent) {
    e.stopPropagation()
    try {
      const r = await api.preferiti.toggle(filePath)
      setFiles((fs) => fs.map((f) => f.key === filePath ? { ...f, isPreferito: r.isPreferito, stato: r.isPreferito ? 'preferito' : 'nuovo' } : f))
      // aggiorna anche cache
      if (annoSelezionato && cartellaSelezionata) {
        const cacheKey = `${annoSelezionato}::${cartellaSelezionata}`
        if (globalCache.files[cacheKey]) {
          globalCache.files[cacheKey] = globalCache.files[cacheKey].map((f) =>
            f.key === filePath ? { ...f, isPreferito: r.isPreferito, stato: r.isPreferito ? 'preferito' : 'nuovo' } : f
          )
        }
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

  // ─── DOWNLOAD ───────────────────────────────────────────────────────────────
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
      // Il server ha già segnato lette le notifiche documento_nuovo: aggiorna
      // subito campanella e pannello notifiche (niente attesa del polling di 5s).
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
      // Il server ha registrato i file scaricati (pallino verde) e segnato le
      // notifiche documento_nuovo come lette: aggiorna subito i badge e la lista.
      window.dispatchEvent(new Event('pfc-documenti-visti'))
      window.dispatchEvent(new Event('pfc-archivio-refresh'))
    } catch (err) {
      toast.error(`Errore ZIP: ${err instanceof Error ? err.message : 'errore sconosciuto'}`, { id: toastId })
    } finally { setZipping(false) }
  }

  // ─── RENDER GUARDS ──────────────────────────────────────────────────────────
  if (r2Error) return (
    <Card><CardContent className="py-12 text-center">
      <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
      <p className="text-slate-700 font-medium mb-1">Cloudflare R2 non configurato</p>
      <p className="text-sm text-slate-500">Lo studio deve ancora configurare lo storage dei documenti.</p>
    </CardContent></Card>
  )

  if (loading) return (<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>)

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
          className="pl-9 pr-10 h-10 text-base sm:text-sm"
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />}
        {searchQuery && !searching && (
          <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* RISULTATI RICERCA */}
      {searchQuery.trim().length >= 2 && (
        <div className="space-y-3">
          {searchResults.length === 0 && !searching ? (
            <Card><CardContent className="py-8 text-center text-slate-500">
              <p className="font-medium">🔍 Nessun documento trovato per &quot;{searchQuery}&quot;</p>
            </CardContent></Card>
          ) : (
            <>
              <div className="bg-emerald-50 border border-emerald-300 rounded-lg px-3 py-1.5 text-xs sm:text-sm text-emerald-800 font-semibold">
                🔍 {searchResults.length} risultati per &quot;{searchQuery}&quot;
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
          {/* ANNI */}
          <div className="flex flex-wrap gap-2">
            {anni.map((a) => (
              <button
                key={a}
                onClick={() => handleAnnoClick(a)}
                className={cn(
                  'px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium border transition-colors',
                  annoSelezionato === a
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50'
                )}
              >
                {a}
              </button>
            ))}
          </div>

          {/* CARTELLE — mostra subito quelle in cache, poi eventuale spinner solo se rete */}
          {loadingCartelle ? (
            <div className="flex items-center gap-2 py-2 text-slate-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Caricamento cartelle...
            </div>
          ) : cartelle.length > 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              {cartelle.map((c) => {
                const active = cartellaSelezionata === c.nome
                return (
                  <button
                    key={c.nome}
                    onClick={() => handleCartellaClick(c.nome)}
                    className={cn(
                      'p-3 sm:p-4 rounded-xl border text-left transition-all',
                      active
                        ? 'border-emerald-500 bg-gradient-to-br from-emerald-50 to-white shadow-md ring-2 ring-emerald-100'
                        : 'border-slate-200 bg-white hover:border-emerald-300 hover:shadow-sm'
                    )}
                  >
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

          {/* FILE LIST */}
          {annoSelezionato && cartellaSelezionata && (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="bg-gradient-to-r from-emerald-600 to-emerald-800 text-white text-xs sm:text-sm font-bold px-2 py-1 sm:px-3 rounded">{cartellaSelezionata}</span>
                  {!loadingFiles && <span className="text-xs sm:text-sm text-slate-500">{files.length} file · {formatBytes(files.reduce((s, f) => s + f.size, 0))}</span>}
                </div>
                <div className="flex items-center gap-2">
                  {selectedFiles.size > 0 ? (
                    <Button size="sm" className="h-7 text-xs" onClick={() => handleDownloadZip(Array.from(selectedFiles), `selezionati.zip`)}>
                      <Package className="h-3 w-3 mr-1" /> ZIP ({selectedFiles.size})
                    </Button>
                  ) : files.length > 0 && !loadingFiles && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleDownloadZip(files.map((f) => f.key), `archivio.zip`)}>
                      <Package className="h-3 w-3 mr-1" /> ZIP tutti
                    </Button>
                  )}
                </div>
              </div>

              {!loadingFiles && (
                <div className="text-[10px] sm:text-xs text-slate-500 flex items-center gap-2 sm:gap-3">
                  <span>🔴 Nuovo</span><span>🔵 Visto</span><span>🟢 Scaricato</span><span>⭐ Preferiti</span>
                </div>
              )}

              {loadingFiles ? (
                <div className="flex items-center gap-2 py-4 text-slate-400 text-sm justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> Caricamento file...
                </div>
              ) : files.length === 0 ? (
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
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {canPreview && (
                              <Button variant="outline" size="sm" className="h-8 w-8 p-0 sm:h-8 sm:w-auto sm:px-2.5" onClick={() => { setPreviewFile(f); setFiles((fs) => fs.map((x) => x.key === f.key && x.stato !== 'scaricato' && x.stato !== 'preferito' ? { ...x, stato: 'visto' } : x)) }}>
                                <Eye className="h-4 w-4 sm:h-3.5 sm:w-3.5 sm:mr-1" /><span className="hidden sm:inline">Anteprima</span>
                              </Button>
                            )}
                            <Button variant="outline" size="sm" className="h-8 w-8 p-0 sm:h-8 sm:w-auto sm:px-2.5" onClick={() => handleDownload(f.key, f.nome)}>
                              <Download className="h-4 w-4 sm:h-3.5 sm:w-3.5 sm:mr-1" /><span className="hidden sm:inline">Scarica</span>
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
