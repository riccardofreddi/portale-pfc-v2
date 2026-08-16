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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Briefcase className="h-4 w-4" />
            </div>
            Cassetto Digitale
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 ml-10 sm:ml-0">
            {files.length} {files.length === 1 ? 'documento' : 'documenti'} · Accesso rapido ai tuoi file essenziali
          </p>
        </div>
        <Button
          onClick={() => setUploadOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto h-10 shadow-sm hover:shadow-md transition-all"
        >
          <UploadCloud className="h-4 w-4 mr-2" />
          Aggiungi documento
        </Button>
      </div>

      {/* Info box */}
      <div className="rounded-xl border border-blue-200/80 bg-gradient-to-br from-blue-50 to-white px-4 py-3.5">
        <p className="text-sm font-semibold text-slate-800 mb-0.5">Cos’è il Cassetto Digitale?</p>
        <p className="text-xs text-slate-600 leading-relaxed">
          Uno spazio sicuro per i documenti che usi spesso (QR P.IVA, visure, identità…). Sempre disponibili con un tap, senza cercare tra le cartelle.
        </p>
      </div>

      {/* Empty state */}
      {files.length === 0 ? (
        <Card className="shadow-card">
          <CardContent className="py-14 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <Briefcase className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-slate-800 font-semibold mb-1">Cassetto ancora vuoto</p>
            <p className="text-sm text-slate-500 max-w-xs mx-auto mb-5">
              Carica QR P.IVA, visura, documento d’identità e altri file che usi spesso.
            </p>
            <Button
              onClick={() => setUploadOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-10"
            >
              <UploadCloud className="h-4 w-4 mr-2" />
              Aggiungi il primo documento
            </Button>
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
      <div
        key={f.key}
        className="group relative bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden
                   transition-all duration-300 ease-out
                   hover:shadow-lg hover:border-slate-300 hover:-translate-y-0.5
                   active:translate-y-0 active:shadow-md"
      >
        {/* Accento laterale con animazione */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 transition-all duration-300 ease-out group-hover:w-1.5"
          style={{ background: accent }}
        />

        <div className="p-4 pl-5">
          {/* Header */}
          <div className="flex items-start gap-3 mb-3.5">
            <div
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl shadow-sm
                         transition-transform duration-300 ease-out group-hover:scale-105"
              style={{
                background: `linear-gradient(135deg, ${accent}22, ${accent}10)`,
                color: accent,
              }}
            >
              <FileText className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <p className="font-semibold text-[15px] text-slate-900 truncate leading-snug transition-colors duration-200 group-hover:text-slate-950">
                {label}
              </p>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <span
                  className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide
                             transition-all duration-200"
                  style={{ background: `${accent}15`, color: accent }}
                >
                  {ext}
                </span>
                <span>{f.sizeStr}</span>
                {f.lastModified && (
                  <span className="hidden sm:inline text-slate-400">
                    · {formatDateShort(f.lastModified)}
                  </span>
                )}
              </div>
            </div>
          </div>


          {/* Azioni */}
          <div className="flex items-center gap-1.5">
            {canPreview && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9 flex-1 text-xs font-medium text-slate-600
                           transition-all duration-200
                           hover:text-emerald-700 hover:bg-emerald-50 hover:scale-[1.02]
                           active:scale-[0.98]"
                onClick={() => setPreviewFile({ ...f, stato: 'visto', isPreferito: false })}
              >
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                Anteprima
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-9 flex-1 text-xs font-medium text-slate-600
                         transition-all duration-200
                         hover:text-blue-700 hover:bg-blue-50 hover:scale-[1.02]
                         active:scale-[0.98]"
              onClick={() => handleDownload(f.key, f.nome)}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Scarica
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 text-slate-400
                         transition-all duration-200
                         hover:text-slate-700 hover:bg-slate-100 hover:scale-110
                         active:scale-95"
              onClick={() => openRename(f)}
              title="Rinomina"
            >
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 text-slate-400
                             transition-all duration-200
                             hover:text-red-600 hover:bg-red-50 hover:scale-110
                             active:scale-95"
                  title="Elimina"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminare definitivamente {f.nome}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Operazione irreversibile. Il file verrà eliminato definitivamente e non sarà più recuperabile.
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
        </div>
      </div>
    )
  })}
</div>

      )}

      {/* Dialog Upload */}
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
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Seleziona tipo..." />
                </SelectTrigger>
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
                className="h-10"
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
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                'Salva nel cassetto'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Rinomina */}
      <Dialog open={!!renameKey} onOpenChange={(o) => !o && setRenameKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rinomina documento</DialogTitle>
            <DialogDescription>
              Inserisci il nuovo nome (l’estensione viene mantenuta automaticamente).
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder="Nuovo nome"
              className="h-10"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameKey(null)}>Annulla</Button>
            <Button
              onClick={handleRenameConfirm}
              disabled={renaming || !renameName.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {renaming ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}