'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { usePfcStore } from '@/store/pfc'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import { UserPlus, Trash2, Edit, Loader2, Users, FolderOpen, Eye, EyeOff, Download, UploadCloud, Briefcase, ChevronDown, ChevronRight, Edit2, CalendarClock } from 'lucide-react'
import { formatBytes, ottieniIconaFile, canPreviewFile, formatDateShort, MAX_FILE_SIZE_MB } from '@/lib/pfc-utils'

interface Cliente { username: string; name: string; exemptMaintenance: boolean; createdAt: string }
interface CassettoFile { nome: string; key: string; size: number; sizeStr: string; lastModified: Date | null }
interface ArchivioFile { nome: string; key: string; size: number; sizeStr: string; lastModified: Date | null }
interface CartellaMeta { nome: string; nFiles: number; nNuovi: number }

export function TabGestioneClienti() {
  const { setPreviewFile } = usePfcStore()
  const [clienti, setClienti] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [editName, setEditName] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [showEditPassword, setShowEditPassword] = useState(false)

  const [selectedCliente, setSelectedCliente] = useState<string>('')
  const [cassettoFiles, setCassettoFiles] = useState<CassettoFile[]>([])
  const [archivioAnni, setArchivioAnni] = useState<string[]>([])
  const [archivioCartelle, setArchivioCartelle] = useState<Record<string, CartellaMeta[]>>({})
  const [archivioFiles, setArchivioFiles] = useState<Record<string, ArchivioFile[]>>({})
  const [loadingArchivio, setLoadingArchivio] = useState(false)
  const [openAnno, setOpenAnno] = useState<string | null>(null)
  const [openCartella, setOpenCartella] = useState<string | null>(null)
  const [deleteBulkTarget, setDeleteBulkTarget] = useState<{ anno: string; cartella?: string } | null>(null)
  const [renameTarget, setRenameTarget] = useState<{ key: string; nome: string } | null>(null)
  const [renameNewName, setRenameNewName] = useState('')
  const [scadenzaTarget, setScadenzaTarget] = useState<{ key: string; nome: string; had: boolean } | null>(null)
  const [scadenzaData, setScadenzaData] = useState('')
  const [scadenzaAnticipo, setScadenzaAnticipo] = useState('10')
  const [scadenzaSaving, setScadenzaSaving] = useState(false)
  const [openCassetto, setOpenCassetto] = useState(false)

  const [uploadTipo, setUploadTipo] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  async function refresh() {
    setLoading(true)
    try { const r = await api.clienti.list(); setClienti(r.clienti) }
    catch { toast.error('Errore caricamento clienti') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    // setTimeout(0): evita setState sincrono nel corpo dell'effect (react-hooks/set-state-in-effect)
    const t = setTimeout(() => { refresh() }, 0)
    return () => clearTimeout(t)
  }, [])

  async function handleDeleteBulk(anno: string, cartella?: string) {
    if (!selectedCliente) return
    const target = cartella ? 'cartella ' + cartella : 'anno ' + anno
    // La conferma è già nell'AlertDialog centrato: nessun window.confirm() in più.
    try {
      const res = await fetch('/api/documenti/delete-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: selectedCliente, anno, cartella }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Errore ' + res.status)
      }
      const data = await res.json()
      toast.success(data.deleted + ' file spostati nel cestino (' + target + ')')
      await loadArchivioCliente(selectedCliente)
    } catch (err) {
      toast.error('Errore eliminazione: ' + (err instanceof Error ? err.message : 'errore'))
    }
  }

  async function loadArchivioCliente(username: string) {
    setLoadingArchivio(true)
    try {
      // Carica cassetto e anni in parallelo
      const [rCass, rAnni] = await Promise.all([
        api.cassetto.list(username),
        api.documenti.list({ username }),
      ])
      setCassettoFiles(rCass.files)
      const anni = rAnni.anni ?? []
      setArchivioAnni(anni)

      // Carica tutte le cartelle di tutti gli anni in parallelo
      const cartelleResults = await Promise.all(anni.map((anno) => api.documenti.list({ username, anno })))
      const cartelleMap: Record<string, CartellaMeta[]> = {}
      for (let i = 0; i < anni.length; i++) {
        cartelleMap[anni[i]] = (cartelleResults[i].cartelle ?? []) as unknown as CartellaMeta[]
      }
      setArchivioCartelle(cartelleMap)

      // Carica tutti i file di tutte le cartelle in parallelo
      const filesMap: Record<string, ArchivioFile[]> = {}
      const filesRequests: Array<{ anno: string; cartella: string; promise: ReturnType<typeof api.documenti.list> }> = []
      for (let i = 0; i < anni.length; i++) {
        for (const cart of cartelleMap[anni[i]]) {
          filesRequests.push({ anno: anni[i], cartella: cart.nome, promise: api.documenti.list({ username, anno: anni[i], cartella: cart.nome }) })
        }
      }
      const filesResults = await Promise.all(filesRequests.map((r) => r.promise))
      for (let i = 0; i < filesRequests.length; i++) {
        const { anno, cartella } = filesRequests[i]
        filesMap[`${anno}_${cartella}`] = (filesResults[i].files ?? []) as unknown as ArchivioFile[]
      }
      setArchivioFiles(filesMap)
    } catch { toast.error('Errore caricamento archivio') }
    finally { setLoadingArchivio(false) }
  }


  useEffect(() => {
    if (selectedCliente) { loadArchivioCliente(selectedCliente) }
  }, [selectedCliente])

  function handleSelectCliente(v: string | null) {
    setSelectedCliente(v ?? '')
    setOpenAnno(null)
    setOpenCartella(null)
    setOpenCassetto(false)
  }

  async function handleCreate() {
    setCreating(true)
    try {
      await api.clienti.create({ username: newUsername, name: newName, password: newPassword })
      toast.success(`Cliente ${newName} registrato`)
      setNewName(''); setNewUsername(''); setNewPassword('')
      await refresh()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Errore') }
    finally { setCreating(false) }
  }

  async function handleDelete(username: string) {
    try { await api.clienti.delete(username); toast.success('Cliente eliminato'); await refresh() }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Errore') }
  }

  function openEdit(c: Cliente) {
    setEditing(c); setEditName(c.name); setEditUsername(c.username); setEditPassword('')
  }

  async function handleSaveEdit() {
    if (!editing) return
    try {
      await api.clienti.update({ oldUsername: editing.username, newUsername: editUsername, newName: editName, newPassword: editPassword || undefined })
      toast.success('Modifiche salvate'); setEditing(null); await refresh()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Errore') }
  }

  async function handleUploadCassetto() {
    if (!uploadTipo || !uploadFile || !selectedCliente) { toast.error('Seleziona tipo e file'); return }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('tipo', uploadTipo)
      formData.append('file', uploadFile)
      await api.cassetto.upload(formData, selectedCliente)
      toast.success('Documento salvato nel cassetto')
      setUploadOpen(false); setUploadTipo(''); setUploadFile(null)
      await loadArchivioCliente(selectedCliente)
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Errore') }
    finally { setUploading(false) }
  }

  async function handleDeleteCassettoFile(key: string) {
    try { await api.cassetto.delete(key); toast.success('File eliminato'); await loadArchivioCliente(selectedCliente) }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Errore') }
  }

  async function handleDeleteArchivioFile(key: string) {
    try { await api.documenti.delete([key]); toast.success('File spostato nel cestino'); await loadArchivioCliente(selectedCliente) }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Errore') }
  }

  async function handleRename() {
    if (!renameTarget) return
    try {
      const res = await fetch('/api/documenti/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: renameTarget.key, newName: renameNewName }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Errore ' + res.status)
      }
      toast.success('File rinominato in: ' + renameNewName)
      setRenameTarget(null)
      setRenameNewName('')
      if (selectedCliente) await loadArchivioCliente(selectedCliente)
    } catch (err) {
      toast.error('Errore rinomina: ' + (err instanceof Error ? err.message : 'errore'))
    }
  }

  function openScadenza(f: { key: string; nome: string }) {
    // Se il file ha già una scadenza (passata dalla lista), precompila i campi.
    const scad = (f as unknown as { scadenza?: { dataScadenza: string; anticipoGiorni: number } }).scadenza
    let dataIniziale = ''
    let anticipoIniziale = 10
    if (scad) {
      // dataScadenza arriva come stringa ISO dal JSON della fetch
      const d = new Date(scad.dataScadenza)
      if (!isNaN(d.getTime())) {
        dataIniziale = d.toISOString().slice(0, 10)
      }
      anticipoIniziale = scad.anticipoGiorni
    }
    setScadenzaTarget({ key: f.key, nome: f.nome, had: !!scad })
    setScadenzaData(dataIniziale)
    setScadenzaAnticipo(String(anticipoIniziale))
  }

  async function handleSaveScadenza() {
    if (!scadenzaTarget) return
    if (!scadenzaData.trim()) { toast.error('Inserisci una data di scadenza'); return }
    setScadenzaSaving(true)
    try {
      const res = await fetch('/api/documenti/scadenza', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: scadenzaTarget.key,
          titolo: scadenzaTarget.nome,
          dataScadenza: scadenzaData,
          anticipoGiorni: Number(scadenzaAnticipo) || 10,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Errore ' + res.status)
      }
      toast.success(`Promemoria impostato per ${scadenzaTarget.nome}`)
      setScadenzaTarget(null)
      if (selectedCliente) await loadArchivioCliente(selectedCliente)
    } catch (err) {
      toast.error('Errore scadenza: ' + (err instanceof Error ? err.message : 'errore'))
    } finally {
      setScadenzaSaving(false)
    }
  }

  async function handleRemoveScadenza() {
    if (!scadenzaTarget) return
    setScadenzaSaving(true)
    try {
      const res = await fetch(`/api/documenti/scadenza?filePath=${encodeURIComponent(scadenzaTarget.key)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Errore ' + res.status)
      toast.success('Promemoria rimosso')
      setScadenzaTarget(null)
      if (selectedCliente) await loadArchivioCliente(selectedCliente)
    } catch {
      toast.error('Errore rimozione promemoria')
    } finally {
      setScadenzaSaving(false)
    }
  }

  async function handleDownload(key: string, nome: string) {
    try {
      const res = await fetch(`/api/documenti/download?key=${encodeURIComponent(key)}`)
      if (!res.ok) throw new Error('Errore')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = nome
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`Download: ${nome}`)
    } catch { toast.error('Errore download') }
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-5 w-5 text-emerald-600" /> Nuovo Cliente</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div className="space-y-1.5"><Label>Ragione Sociale</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="es. Rossi Mario S.r.l." /></div>
          <div className="space-y-1.5"><Label>Username</Label><Input value={newUsername} onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))} placeholder="es. rossi" maxLength={20} /></div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <div className="relative">
              <Input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 4 caratteri"
                className="pr-10 text-base sm:text-sm"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-600 transition-colors p-1"
                aria-label={showNewPassword ? 'Nascondi password' : 'Mostra password'}
                tabIndex={-1}
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button onClick={handleCreate} disabled={creating || !newName || !newUsername || !newPassword} className="bg-emerald-700 hover:bg-emerald-800 text-white">
            {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />} Registra
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FolderOpen className="h-5 w-5 text-emerald-600" /> Archivio Cliente</CardTitle></CardHeader>
        <CardContent>
          <Select value={selectedCliente || undefined} onValueChange={(v) => handleSelectCliente(v ?? '')}>
            <SelectTrigger><SelectValue placeholder="Seleziona cliente" /></SelectTrigger>
            <SelectContent>
              {clienti.map((c) => <SelectItem key={c.username} value={c.username}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>

          {loadingArchivio && <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}

          {selectedCliente && !loadingArchivio && (
            <div className="mt-4 space-y-4">
              <Collapsible open={openCassetto} onOpenChange={setOpenCassetto}>
                <Card>
                  <CollapsibleTrigger>
                    <CardHeader className="cursor-pointer hover:bg-slate-50">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-emerald-600" /> Cassetto Digitale ({cassettoFiles.length})</span>
                        {openCassetto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </CardTitle>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="space-y-3">
                      <Button size="sm" onClick={() => setUploadOpen(true)} className="bg-emerald-700 hover:bg-emerald-800 text-white">
                        <UploadCloud className="h-3.5 w-3.5 mr-1.5" /> Carica nel cassetto
                      </Button>
                      {cassettoFiles.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-4">Cassetto vuoto</p>
                      ) : (
                        <div className="space-y-2">
                          {cassettoFiles.map((f) => {
                            const icon = ottieniIconaFile(f.nome)
                            return (
                              <div key={f.key} className="flex items-center gap-3 p-2 bg-white border border-slate-200 rounded-lg">
                                <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: icon.bg, color: icon.fg }}>{icon.icon}</div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{f.nome}</p>
                                  <p className="text-xs text-slate-500">{f.sizeStr}</p>
                                </div>
                                <div className="flex gap-1">
                                  {canPreviewFile(f.nome) && <Button variant="outline" size="sm" onClick={() => setPreviewFile({ ...f, stato: 'nuovo', isPreferito: false })}><Eye className="h-3 w-3" /></Button>}
                                  <Button variant="outline" size="sm" onClick={() => handleDownload(f.key, f.nome)}><Download className="h-3 w-3" /></Button>
<Button variant="outline" size="sm" onClick={() => { setRenameTarget({ key: f.key, nome: f.nome }); setRenameNewName(f.nome) }}><Edit2 className="h-3 w-3" /></Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="text-red-600"><Trash2 className="h-3 w-3" /></Button></AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader><AlertDialogTitle>Eliminare {f.nome}?</AlertDialogTitle><AlertDialogDescription>Operazione irreversibile.</AlertDialogDescription></AlertDialogHeader>
                                      <AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteCassettoFile(f.key)} className="bg-red-600 hover:bg-red-700">Elimina</AlertDialogAction></AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>

              {archivioAnni.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">Nessun documento nell&apos;archivio</p>
              ) : (
                archivioAnni.map((anno) => (
                  <Collapsible key={anno} open={openAnno === anno} onOpenChange={(o) => setOpenAnno(o ? anno : null)}>
                    <Card>
                      <CollapsibleTrigger>
                        <CardHeader className="cursor-pointer hover:bg-slate-50">
                          <CardTitle className="text-sm flex items-center justify-between">
                            <span className="flex items-center gap-2"><FolderOpen className="h-4 w-4 text-blue-600" /> Anno {anno}</span><Button variant="ghost" size="sm" className="ml-auto text-red-600 hover:bg-red-50 h-6 px-2 text-xs" onClick={() => setDeleteBulkTarget({ anno })}><Trash2 className="h-3 w-3 mr-1" />Elimina anno</Button>
                            {openAnno === anno ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </CardTitle>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="space-y-3">
                          {(archivioCartelle[anno] ?? []).map((cart) => {
                            const cartKey = `${anno}_${cart.nome}`
                            const filesInCart = archivioFiles[cartKey] ?? []
                            return (
                              <Collapsible key={cartKey} open={openCartella === cartKey} onOpenChange={(o) => setOpenCartella(o ? cartKey : null)}>
                                <div className="border border-slate-200 rounded-lg overflow-hidden">
                                  <CollapsibleTrigger>
                                    <button className="w-full flex items-center justify-between p-3 hover:bg-slate-50 text-left text-sm">
                                      <div className="flex items-center gap-2">
                                        {openCartella === cartKey ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                        <span className="font-medium">📂 {cart.nome}</span><Button variant="ghost" size="sm" className="ml-2 text-red-600 hover:bg-red-50 h-5 px-1.5 text-[10px]" onClick={() => setDeleteBulkTarget({ anno, cartella: cart.nome })}><Trash2 className="h-2.5 w-2.5 mr-0.5" />Elimina</Button>
                                      </div>
                                      <span className="text-xs text-slate-500">{cart.nFiles} file</span>
                                    </button>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    <div className="border-t border-slate-200 p-3 space-y-2 bg-slate-50/30">
                                      {filesInCart.map((f) => {
                                        const icon = ottieniIconaFile(f.nome)
                                        return (
                                          <div key={f.key} className="flex items-center gap-3 p-2 bg-white border border-slate-200 rounded-lg">
                                            <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: icon.bg, color: icon.fg }}>{icon.icon}</div>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-sm font-medium truncate">{f.nome}</p>
                                              <p className="text-xs text-slate-500">{f.sizeStr}</p>
                                            </div>
                                            <div className="flex gap-1">
                                              {canPreviewFile(f.nome) && <Button variant="outline" size="sm" onClick={() => setPreviewFile({ ...f, stato: 'nuovo', isPreferito: false })}><Eye className="h-3 w-3" /></Button>}
                                              <Button variant="outline" size="sm" onClick={() => handleDownload(f.key, f.nome)}><Download className="h-3 w-3" /></Button>
<Button variant="outline" size="sm" onClick={() => { setRenameTarget({ key: f.key, nome: f.nome }); setRenameNewName(f.nome) }}><Edit2 className="h-3 w-3" /></Button>
{(f as unknown as { scadenza?: { dataScadenza: string; anticipoGiorni: number } }).scadenza && (
                                                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">⏰ {new Date((f as unknown as { scadenza: { dataScadenza: string } }).scadenza.dataScadenza).toLocaleDateString('it-IT')}</span>
                                              )}
                                              <Button variant="outline" size="sm" className="text-amber-700 border-amber-300" onClick={() => openScadenza(f)}><CalendarClock className="h-3 w-3" /></Button>
                                              <AlertDialog>
                                                <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="text-red-600"><Trash2 className="h-3 w-3" /></Button></AlertDialogTrigger>
                                                <AlertDialogContent>
                                                  <AlertDialogHeader><AlertDialogTitle>Eliminare {f.nome}?</AlertDialogTitle><AlertDialogDescription>Il file verra spostato nel cestino.</AlertDialogDescription></AlertDialogHeader>
                                                  <AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteArchivioFile(f.key)} className="bg-red-600 hover:bg-red-700">Elimina</AlertDialogAction></AlertDialogFooter>
                                                </AlertDialogContent>
                                              </AlertDialog>
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </CollapsibleContent>
                                </div>
                              </Collapsible>
                            )
                          })}
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-5 w-5 text-emerald-600" /> Clienti registrati ({clienti.length})</CardTitle></CardHeader>
        <CardContent>
          {clienti.length === 0 ? <p className="text-sm text-slate-500 text-center py-8">Nessun cliente registrato</p> : (
            <div className="space-y-3">
              {clienti.map((c) => (
                <div key={c.username} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{c.name}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c)}><Edit className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Elimina cliente {c.name}?</AlertDialogTitle><AlertDialogDescription>Operazione irreversibile.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={() => handleDelete(c.username)} className="bg-red-600 hover:bg-red-700">Elimina</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifica cliente</DialogTitle><DialogDescription>Lascia la password vuota per mantenerla.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Ragione Sociale</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Username</Label><Input value={editUsername} onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))} maxLength={20} /></div>
            <div className="space-y-1.5">
              <Label>Nuova password (opzionale)</Label>
              <div className="relative">
                <Input
                  type={showEditPassword ? 'text' : 'password'}
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Mantieni attuale"
                  className="pr-10 text-base sm:text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowEditPassword(!showEditPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-600 transition-colors p-1"
                  aria-label={showEditPassword ? 'Nascondi password' : 'Mostra password'}
                  tabIndex={-1}
                >
                  {showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Annulla</Button><Button onClick={handleSaveEdit} className="bg-emerald-700 hover:bg-emerald-800 text-white">Salva</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Carica nel cassetto di {clienti.find(c => c.username === selectedCliente)?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><Label>Tipo documento</Label>
              <Select value={uploadTipo || undefined} onValueChange={(v) => setUploadTipo(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleziona tipo..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="QR Code P.IVA">QR Code P.IVA</SelectItem>
                  <SelectItem value="Certificato P.IVA">Certificato P.IVA</SelectItem>
                  <SelectItem value="Visura Camerale">Visura Camerale</SelectItem>
                  <SelectItem value="Doc. Identita">Doc. Identita</SelectItem>
                  <SelectItem value="IBAN">IBAN</SelectItem>
                  <SelectItem value="Altro">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>File (max {MAX_FILE_SIZE_MB}MB)</Label><Input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Annulla</Button>
            <Button onClick={handleUploadCassetto} disabled={uploading || !uploadTipo || !uploadFile} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-2" />} Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog conferma eliminazione anno/cartella bulk */}
      <AlertDialog open={!!deleteBulkTarget} onOpenChange={(o) => !o && setDeleteBulkTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {deleteBulkTarget?.cartella ? 'la cartella ' + deleteBulkTarget.cartella : 'l\u2019anno ' + deleteBulkTarget?.anno}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tutti i file verranno spostati nel cestino. Potrai recuperarli dalla scheda Cestino.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteBulkTarget) {
                  handleDeleteBulk(deleteBulkTarget.anno, deleteBulkTarget.cartella)
                  setDeleteBulkTarget(null)
                }
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Dialog rinomina file */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rinomina file</DialogTitle>
          </DialogHeader>
          <div className='space-y-3 py-2'>
            <p className='text-sm text-slate-500'>File originale: <span className='font-mono'>{renameTarget?.nome}</span></p>
            <Input value={renameNewName} onChange={(e) => setRenameNewName(e.target.value)} placeholder='Nuovo nome file' />
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setRenameTarget(null)}>Annulla</Button>
            <Button onClick={handleRename} disabled={!renameNewName.trim() || renameNewName === renameTarget?.nome} className='bg-emerald-700 hover:bg-emerald-800 text-white'>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog promemoria scadenza */}
      <Dialog open={!!scadenzaTarget} onOpenChange={(o) => !o && setScadenzaTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-amber-600" /> Promemoria scadenza</DialogTitle>
            <DialogDescription>
              Il cliente riceverà una notifica push N giorni prima della scadenza (anche se non è loggato).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-slate-500">File: <span className="font-mono break-all">{scadenzaTarget?.nome}</span></p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data scadenza</Label>
                <Input type="date" value={scadenzaData} onChange={(e) => setScadenzaData(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Avvisa N giorni prima</Label>
                <Input type="number" min={1} max={365} value={scadenzaAnticipo} onChange={(e) => setScadenzaAnticipo(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setScadenzaTarget(null)}>Annulla</Button>
            {scadenzaTarget?.had && (
              <Button variant="outline" className="text-red-600 border-red-300" onClick={handleRemoveScadenza} disabled={scadenzaSaving}>
                Rimuovi
              </Button>
            )}
            <Button onClick={handleSaveScadenza} disabled={scadenzaSaving || !scadenzaData.trim()} className="bg-amber-600 hover:bg-amber-700 text-white">
              {scadenzaSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Salva promemoria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
