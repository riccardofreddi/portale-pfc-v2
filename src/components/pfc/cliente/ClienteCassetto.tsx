'use client'

import { useEffect, useState } from 'react'
import { usePfcStore } from '@/store/pfc'
import { api } from '@/lib/api-client'
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
  Briefcase, UploadCloud, Download, Eye, Edit, Trash2, Loader2, FileText,
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

  if (loading) {
      return (
        <div className="space-y-5 animate-pulse">
          <div className="h-28 rounded-3xl bg-gradient-to-br from-emerald-100 to-slate-100" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-40 rounded-2xl bg-slate-100 border border-slate-200/60" />
            ))}
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-5">
        {/* Hero header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-5 sm:p-6 text-white shadow-xl shadow-emerald-900/20">
          <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-teal-300/20 blur-2xl" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm ring-1 ring-white/25 shadow-lg">
                <Briefcase className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold tracking-tight">Cassetto Digitale</h3>
                <p className="text-emerald-100/90 text-xs sm:text-sm mt-1 leading-relaxed max-w-md">
                  I tuoi documenti essenziali, sempre a portata di mano.
                </p>
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white/95 ring-1 ring-white/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  {files.length} {files.length === 1 ? 'documento' : 'documenti'}
                </p>
              </div>
            </div>
            <Button
              onClick={() => setUploadOpen(true)}
              className="w-full sm:w-auto h-11 rounded-xl bg-white text-emerald-800 hover:bg-emerald-50 font-semibold shadow-lg shadow-black/10 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <UploadCloud className="h-4 w-4 mr-2" />
              Aggiungi documento
            </Button>
          </div>
        </div>

        {/* Info tip */}
        <div className="rounded-2xl border border-sky-200/80 bg-gradient-to-r from-sky-50 to-white px-4 py-3.5 flex gap-3 items-start shadow-sm">
          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Cos’è il Cassetto Digitale?</p>
            <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
              È il tuo spazio sicuro per QR P.IVA, visure, identità e IBAN. Carica un documento qui sopra e lo ritrovi subito, senza cercarlo tra le cartelle.
            </p>
          </div>
        </div>

        {/* Empty state */}
        {files.length === 0 ? (
          <div className="relative overflow-hidden rounded-3xl border border-dashed border-slate-300 bg-gradient-to-b from-white to-slate-50 px-6 py-16 text-center shadow-sm">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-100 to-teal-50 text-emerald-600 shadow-inner ring-1 ring-emerald-200/60">
              <Briefcase className="h-8 w-8" />
            </div>
            <p className="text-lg font-bold text-slate-900">Cassetto ancora vuoto</p>
            <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
              Carica i documenti che usi più spesso: saranno sempre qui, ordinati e pronti.
            </p>
            <Button
              onClick={() => setUploadOpen(true)}
              className="mt-6 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg transition-all"
            >
              <UploadCloud className="h-4 w-4 mr-2" />
              Aggiungi il primo documento
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {files.map((f, idx) => {
              const accent = getColorForFile(f.nome)
              const label = getLabelForFile(f.nome)
              const ext = f.nome.split('.').pop()?.toUpperCase() ?? ''
              const canPreview = canPreviewFile(f.nome)

              return (
                <div
                  key={f.key}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white
                             shadow-[0_2px_12px_-4px_rgba(15,23,42,0.08)]
                             transition-all duration-300 ease-out
                             hover:-translate-y-1 hover:shadow-[0_16px_40px_-12px_rgba(15,23,42,0.18)]
                             hover:border-slate-300
                             active:translate-y-0"
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  {/* Glow on hover */}
                  <div
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{
                      background: `radial-gradient(600px circle at 50% 0%, ${accent}14, transparent 55%)`,
                    }}
                  />

                  {/* Top accent bar */}
                  <div
                    className="h-1.5 w-full transition-all duration-300 group-hover:h-2"
                    style={{
                      background: `linear-gradient(90deg, ${accent}, ${accent}99)`,
                    }}
                  />

                  <div className="relative p-4 sm:p-5">
                    {/* Header */}
                    <div className="flex items-start gap-3.5 mb-4">
                      <div
                        className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl shadow-sm
                                   transition-transform duration-300 group-hover:scale-110 group-hover:rotate-1"
                        style={{
                          background: `linear-gradient(145deg, ${accent}28, ${accent}10)`,
                          color: accent,
                          boxShadow: `0 8px 20px -8px ${accent}66`,
                        }}
                      >
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="font-bold text-[15px] text-slate-900 truncate leading-snug tracking-tight">
                          {label}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span
                            className="inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase"
                            style={{ background: `${accent}16`, color: accent }}
                          >
                            {ext}
                          </span>
                          <span className="text-slate-400">·</span>
                          <span>{f.sizeStr}</span>
                          {f.lastModified && (
                            <>
                              <span className="text-slate-400 hidden sm:inline">·</span>
                              <span className="hidden sm:inline">{formatDateShort(f.lastModified)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 rounded-xl bg-slate-50/80 p-1.5 ring-1 ring-slate-100">
                      {canPreview && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-10 flex-1 text-xs font-semibold text-slate-600 rounded-lg
                                     hover:text-emerald-700 hover:bg-emerald-50 transition-all duration-200
                                     hover:scale-[1.02] active:scale-[0.98]"
                          onClick={() => setPreviewFile({ ...f, stato: 'visto', isPreferito: false })}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1.5" />
                          Anteprima
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-10 flex-1 text-xs font-semibold text-slate-600 rounded-lg
                                   hover:text-blue-700 hover:bg-blue-50 transition-all duration-200
                                   hover:scale-[1.02] active:scale-[0.98]"
                        onClick={() => handleDownload(f.key, f.nome)}
                      >
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Scarica
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-10 w-10 p-0 text-slate-400 rounded-lg
                                   hover:text-slate-700 hover:bg-white transition-all duration-200
                                   hover:scale-110 active:scale-95"
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
                            className="h-10 w-10 p-0 text-slate-400 rounded-lg
                                       hover:text-red-600 hover:bg-red-50 transition-all duration-200
                                       hover:scale-110 active:scale-95"
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
          <DialogContent className="rounded-2xl sm:rounded-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <UploadCloud className="h-4 w-4" />
                </span>
                Carica nel cassetto
              </DialogTitle>
              <DialogDescription>
                Scegli il tipo di documento e seleziona il file da caricare.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Tipo documento</Label>
                <Select value={tipoSel} onValueChange={(v) => setTipoSel(v ?? '')}>
                  <SelectTrigger className="h-11 rounded-xl">
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
                  className="h-11 rounded-xl file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-emerald-700"
                  onChange={(e) => setFileSel(e.target.files?.[0] ?? null)}
                />
                {fileSel && (
                  <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                    {fileSel.name} · {formatBytes(fileSel.size)}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => setUploadOpen(false)}>
                Annulla
              </Button>
              <Button
                onClick={handleUpload}
                disabled={uploading || !tipoSel || !fileSel}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
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
          <DialogContent className="rounded-2xl">
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
                className="h-11 rounded-xl"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => setRenameKey(null)}>
                Annulla
              </Button>
              <Button
                onClick={handleRenameConfirm}
                disabled={renaming || !renameName.trim()}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white"
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

