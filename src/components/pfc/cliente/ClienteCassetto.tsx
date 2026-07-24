'use client'

import { useEffect, useState } from 'react'
import { usePfcStore } from '@/store/pfc'
import { api } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { canPreviewFile, formatBytes, formatDateShort, MAX_FILE_SIZE_MB } from '@/lib/pfc-utils'
import {
  Briefcase, UploadCloud, Download, Eye, Edit, Trash2, Loader2, Inbox, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface CassettoFile {
  nome: string
  key: string
  size: number
  sizeStr: string
  lastModified: Date | null
}

const DOC_COLORS: Record<string, string> = {
  qr_code: '#059669',
  certificato: '#b45309',
  visura: '#0369a1',
  doc_identita: '#be123c',
  iban: '#6d28d9',
  altro: '#475569',
  default: '#64748b',
}

function getColorForFile(nome: string): string {
  const n = nome.toLowerCase()
  for (const [k, v] of Object.entries(DOC_COLORS)) {
    if (k !== 'default' && n.includes(k)) return v
  }
  return DOC_COLORS.default
}

function getLabelForFile(nome: string): string {
  const base = nome.split('.')[0]
  return base
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function ClienteCassetto() {
  const { user, setPreviewFile } = usePfcStore()
  const [files, setFiles] = useState<CassettoFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [tipoSel, setTipoSel] = useState('')
  const [fileSel, setFileSel] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [renameKey, setRenameKey] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)

  async function refresh() {
    if (!user) return
    setLoading(true)
    try {
      const r = await api.cassetto.list()
      setFiles(r.files)
    } catch (err) {
      toast.error('Errore caricamento cassetto')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [user])

  async function handleUpload() {
    if (!tipoSel) { toast.error('Seleziona tipo documento'); return }
    if (!fileSel) { toast.error('Seleziona un file'); return }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('tipo', tipoSel)
      formData.append('file', fileSel)
      await api.cassetto.upload(formData)
      toast.success('Documento salvato nel cassetto')
      setUploadOpen(false); setTipoSel(''); setFileSel(null)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore upload')
    } finally {
      setUploading(false)
    }
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
      toast.success(`Download: ${nome}`)
    } catch { toast.error('Errore download') }
  }

  async function handleDelete(key: string, nome: string) {
    try {
      await api.cassetto.delete(key)
      toast.success(`${nome} eliminato`)
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore eliminazione')
    }
  }

  function openRename(file: CassettoFile) {
    setRenameKey(file.key)
    setRenameName(file.nome.split('.')[0])
  }

  async function handleRenameConfirm() {
    if (!renameKey || !renameName.trim()) return
    setRenaming(true)
    try {
      const r = await api.cassetto.rename(renameKey, renameName)
      toast.success(`Rinominato in ${r.newName}`)
      setRenameKey(null); setRenameName('')
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore rinomina')
    } finally {
      setRenaming(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-emerald-600" />
            Cassetto Digitale
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {files.length} {files.length === 1 ? 'documento' : 'documenti'} archiviati · Accesso rapido ai tuoi documenti essenziali
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="bg-emerald-700 hover:bg-emerald-800 text-white">
          <UploadCloud className="h-4 w-4 mr-2" /> Aggiungi documento
        </Button>
      </div>

      <Card className="bg-blue-50/50 border-blue-200">
        <CardContent className="py-4 text-sm text-slate-700">
          <p className="font-semibold mb-1">Cos'è il Cassetto Digitale?</p>
          <p className="text-xs text-slate-600">Uno spazio sicuro per i documenti che usi spesso (QR P.IVA, visure, identità...). Sempre disponibile con un click, senza cercare tra le cartelle.</p>
        </CardContent>
      </Card>

      {files.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Briefcase className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-700 font-medium mb-1">Cassetto ancora vuoto</p>
            <p className="text-sm text-slate-500">Carica QR P.IVA, visura, documento d'identità e altri file che usi spesso.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {files.map((f) => {
            const accent = getColorForFile(f.nome)
            const label = getLabelForFile(f.nome)
            const ext = f.nome.split('.').pop()?.toUpperCase() ?? ''
            const canPreview = canPreviewFile(f.nome)
            return (
              <Card
                key={f.key}
                className="border-t-4 hover:shadow-md transition-all"
                style={{ borderTopColor: accent }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${accent}15`, color: accent }}
                    >
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-slate-900 truncate">{label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {f.sizeStr} · <span className="px-1.5 py-0.5 rounded font-bold text-xs" style={{ background: `${accent}18`, color: accent }}>{ext}</span>
                        {f.lastModified && <span className="ml-2">· {formatDateShort(f.lastModified)}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {canPreview && (
                      <Button variant="outline" size="sm" onClick={() => setPreviewFile({ ...f, stato: 'visto', isPreferito: false })}>
                        <Eye className="h-3.5 w-3.5 mr-1" /> Anteprima
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => handleDownload(f.key, f.nome)}>
                      <Download className="h-3.5 w-3.5 mr-1" /> Scarica
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openRename(f)}>
                      <Edit className="h-3.5 w-3.5 mr-1" /> Rinomina
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Elimina
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminare {f.nome}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Il file verrà spostato nel cestino. Potrai recuperarlo in seguito.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(f.key, f.nome)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Elimina
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Carica nel cassetto</DialogTitle>
            <DialogDescription>Scegli il tipo di documento e seleziona il file da caricare.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Tipo documento</Label>
              <Select value={tipoSel} onValueChange={(v) => setTipoSel(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleziona tipo..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="QR Code P.IVA">QR Code P.IVA</SelectItem>
                  <SelectItem value="Certificato P.IVA">Certificato P.IVA</SelectItem>
                  <SelectItem value="Visura Camerale">Visura Camerale</SelectItem>
                  <SelectItem value="Doc. Identità">Doc. Identità</SelectItem>
                  <SelectItem value="IBAN">IBAN</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>File (max {MAX_FILE_SIZE_MB}MB)</Label>
              <Input
                type="file"
                onChange={(e) => setFileSel(e.target.files?.[0] ?? null)}
              />
              {fileSel && (
                <p className="text-xs text-slate-500">
                  {fileSel.name} · {formatBytes(fileSel.size)}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Annulla</Button>
            <Button
              onClick={handleUpload}
              disabled={uploading || !tipoSel || !fileSel}
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvataggio...</> : <>Salva nel cassetto</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameKey} onOpenChange={(o) => !o && setRenameKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rinomina documento</DialogTitle>
            <DialogDescription>Inserisci il nuovo nome (l'estensione viene mantenuta automaticamente).</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder="Nuovo nome"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameKey(null)}>Annulla</Button>
            <Button
              onClick={handleRenameConfirm}
              disabled={renaming || !renameName.trim()}
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              {renaming ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Edit className="h-4 w-4 mr-2" />}
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
