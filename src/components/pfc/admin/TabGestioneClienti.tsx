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
import { UserPlus, Trash2, Edit, Loader2, Users, FolderOpen, Eye, Download, UploadCloud, Briefcase, ChevronDown, ChevronRight } from 'lucide-react'
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
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [editName, setEditName] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editPassword, setEditPassword] = useState('')

  // Archivio cliente selezionato
  const [selectedCliente, setSelectedCliente] = useState<string>('none')
  const [cassettoFiles, setCassettoFiles] = useState<CassettoFile[]>([])
  const [archivioAnni, setArchivioAnni] = useState<string[]>([])
  const [archivioCartelle, setArchivioCartelle] = useState<Record<string, CartellaMeta[]>>({})
  const [archivioFiles, setArchivioFiles] = useState<Record<string, ArchivioFile[]>>({})
  const [loadingArchivio, setLoadingArchivio] = useState(false)
  const [openAnno, setOpenAnno] = useState<string | null>(null)
  const [openCartella, setOpenCartella] = useState<string | null>(null)
  
  // Upload cassetto
  const [uploadTipo, setUploadTipo] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const r = await api.clienti.list()
      setClienti(r.clienti)
    } catch { toast.error('Errore caricamento clienti') }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  async function loadArchivioCliente(username: string) {
    setLoadingArchivio(true)
    try {
      // Carica cassetto
      const rCass = await api.cassetto.list(username)
      setCassettoFiles(rCass.files)
      
      // Carica anni
      const rAnni = await api.documenti.list({ username })
      setArchivioAnni(rAnni.anni ?? [])
      
      // Per ogni anno, carica cartelle e file
      const cartelleMap: Record<string, CartellaMeta[]> = {}
      const filesMap: Record<string, ArchivioFile[]> = {}
      for (const anno of (rAnni.anni ?? [])) {
        const rCart = await api.documenti.list({ username, anno })
        cartelleMap[anno] = (rCart.cartelle ?? []) as unknown as CartellaMeta[]
        for (const cart of cartelleMap[anno]) {
          const rFiles = await api.documenti.list({ username, anno, cartella: cart.nome })
          filesMap[`${anno}_${cart.nome}`] = (rFiles.files ?? []) as unknown as ArchivioFile[]
        }
      }
      setArchivioCartelle(cartelleMap)
      setArchivioFiles(filesMap)
    } catch { toast.error('Errore caricamento archivio') }
    finally { setLoadingArchivio(false) }
  }

  useEffect(() => {
    if (selectedCliente !== 'none') {
      loadArchivioCliente(selectedCliente)
    }
  }, [selectedCliente])

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
    if (!uploadTipo || !uploadFile || selectedCliente === 'none') { toast.error('Seleziona tipo e file'); return }
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
    try {
      await api.cassetto.delete(key)
      toast.success('File eliminato')
      await loadArchivioCliente(selectedCliente)
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Errore') }
  }

  async function handleDeleteArchivioFile(key: string) {
    try {
      await api.documenti.delete([key])
      toast.success('File eliminato e spostato nel cestino')
      await loadArchivioCliente(selectedCliente)
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Errore') }
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
      {/* Form nuovo cliente */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-5 w-5 text-emerald-600" /> Nuovo Cliente</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div className="space-y-1.5">
            <Label>Ragione Sociale</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="es. Rossi Mario S.r.l." />
          </div>
          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))} placeholder="es. rossi" maxLength={20} />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 4 caratteri" />
          </div>
          <Button onClick={handleCreate} disabled={creating || !newName || !newUsername || !newPassword} className="bg-emerald-700 hover:bg-emerald-800 text-white">
            {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />} Registra
          </Button>
        </CardContent>
      </Card>

      {/* Archivio Cliente (admin preview) */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FolderOpen className="h-5 w-5 text-emerald-600" /> Archivio Cliente</CardTitle></CardHeader>
        <CardContent>
          <Select value={selectedCliente} onValueChange={(v) => { setSelectedCliente(v ?? 'none'); setOpenAnno(null); setOpenCartella(null) }}>
            <SelectTrigger><SelectValue placeholder="Seleziona cliente per visualizzare l'archivio" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Seleziona</SelectItem>
              {clienti.map((c) => <SelectItem key={c.username} value={c.username}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>

          {loadingArchivio && <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}

          {selectedCliente !== 'none' && !loadingArchivio && (
            <div className="mt-4 space-y-4">
              {/* Cassetto Digitale */}
              <Collapsible defaultOpen>
                <Card>
                  <CollapsibleTrigger>
                    <CardHeader className="cursor-pointer hover:bg-slate-50">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-emerald-600" /> Cassetto Digitale ({cassettoFiles.length})</span>
                        <ChevronDown className="h-4 w-4" />
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
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="text-red-600"><Trash2 className="h-3 w-3" /></Button></AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader><AlertDialogTitle>Eliminare {f.nome}?</AlertDialogTitle><AlertDialogDescription>Il file verrà spostato nel cestino.</AlertDialogDescription></AlertDialogHeader>
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

              {/* Archivio documenti per anno/cartella */}
              {archivioAnni.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">Nessun documento nell'archivio</p>
              ) : (
                archivioAnni.map((anno) => (
                  <Collapsible key={anno} open={openAnno === anno} onOpenChange={(o) => setOpenAnno(o ? anno : null)}>
                    <Card>
                      <CollapsibleTrigger>
                        <CardHeader className="cursor-pointer hover:bg-slate-50">
                          <CardTitle className="text-sm flex items-center justify-between">
                            <span className="flex items-center gap-2"><FolderOpen className="h-4 w-4 text-blue-600" /> Anno {anno}</span>
                            {openAnno === anno ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </CardTitle>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="space-y-2">
                          {(archivioCartelle[anno] ?? []).map((cart) => {
                            const cartKey = `${anno}_${cart.nome}`
                            const filesInCart = archivioFiles[cartKey] ?? []
                            return (
                              <Collapsible key={cartKey} open={openCartella === cartKey} onOpenChange={(o) => setOpenCartella(o ? cartKey : null)}>
                                <div className="border border-slate-200 rounded-lg overflow-hidden">
                                  <CollapsibleTrigger>
                                    <button className="w-full flex items-center justify-between p-2 hover:bg-slate-50 text-left text-sm">
                                      <div className="flex items-center gap-2">
                                        {openCartella === cartKey ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                        <span className="font-medium">📂 {cart.nome}</span>
                                      </div>
                                      <span className="text-xs text-slate-500">{cart.nFiles} file</span>
                                    </button>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    <div className="border-t border-slate-200 p-2 space-y-1 bg-slate-50/30">
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
                                              <AlertDialog>
                                                <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="text-red-600"><Trash2 className="h-3 w-3" /></Button></AlertDialogTrigger>
                                                <AlertDialogContent>
                                                  <AlertDialogHeader><AlertDialogTitle>Eliminare {f.nome}?</AlertDialogTitle><AlertDialogDescription>Il file verrà spostato nel cestino.</AlertDialogDescription></AlertDialogHeader>
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

      {/* Lista clienti */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-5 w-5 text-emerald-600" /> Clienti registrati ({clienti.length})</CardTitle></CardHeader>
        <CardContent>
          {clienti.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">Nessun cliente registrato</p>
          ) : (
            <div className="space-y-2">
              {clienti.map((c) => (
                <div key={c.username} className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900 truncate">{c.name}</p>
                      {c.exemptMaintenance && <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">Esente</Badge>}
                    </div>
                    <p className="text-xs text-slate-500">@{c.username}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c)}><Edit className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Elimina cliente {c.name}?</AlertDialogTitle>
                          <AlertDialogDescription>Operazione irreversibile. Verranno eliminati anche tutti i documenti su Cloudflare R2 e lo storico messaggi/notifiche.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(c.username)} className="bg-red-600 hover:bg-red-700">Elimina definitivamente</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog modifica */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica cliente</DialogTitle>
            <DialogDescription>Modifica i dati del cliente. Lascia la password vuota per mantenerla.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>Ragione Sociale</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Username</Label><Input value={editUsername} onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))} maxLength={20} /></div>
            <div className="space-y-1.5"><Label>Nuova password (opzionale)</Label><Input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Mantieni attuale" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Annulla</Button>
            <Button onClick={handleSaveEdit} className="bg-emerald-700 hover:bg-emerald-800 text-white">Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog upload cassetto */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Carica nel cassetto di {clienti.find(c => c.username === selectedCliente)?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Tipo documento</Label>
              <Select value={uploadTipo} onValueChange={(v) => setUploadTipo(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleziona tipo..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="QR Code P.IVA">QR Code P.IVA</SelectItem>
                  <SelectItem value="Certificato P.IVA">Certificato P.IVA</SelectItem>
                  <SelectItem value="Visura Camerale">Visura Camerale</SelectItem>
                  <SelectItem value="Doc. Identità">Doc. Identità</SelectItem>
                  <SelectItem value="IBAN">IBAN</SelectItem>
                  <SelectItem value="Altro">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>File (max {MAX_FILE_SIZE_MB}MB)</Label>
              <Input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Annulla</Button>
            <Button onClick={handleUploadCassetto} disabled={uploading || !uploadTipo || !uploadFile} className="bg-emerald-700 hover:bg-emerald-800 text-white">
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-2" />} Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
