'use client'

import { usePfcStore } from '@/store/pfc'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, X } from 'lucide-react'
import { toast } from 'sonner'

export function PreviewModal() {
  const { previewFile, setPreviewFile } = usePfcStore()
  if (!previewFile) return null

  const isPdf = previewFile.nome.toLowerCase().endsWith('.pdf')
  const isImage = /\.(jpg|jpeg|png|svg|gif|webp)$/i.test(previewFile.nome)
  const previewUrl = `/api/documenti/preview?key=${encodeURIComponent(previewFile.key)}`

  async function handleDownload() {
    if (!previewFile) return
    try {
      const res = await fetch(`/api/documenti/download?key=${encodeURIComponent(previewFile.key)}`)
      if (!res.ok) throw new Error('Errore download')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = previewFile.nome
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`Download: ${previewFile.nome}`)
    } catch {
      toast.error('Errore download')
    }
  }

  return (
    <Dialog open={!!previewFile} onOpenChange={(o) => !o && setPreviewFile(null)}>
      <DialogContent className="!max-w-[95vw] !w-[95vw] !h-[95vh] !max-h-[95vh] flex flex-col p-0 gap-0 [&>button]:hidden">
        <DialogHeader className="px-4 py-2.5 border-b border-slate-200 flex-row items-center justify-between space-y-0 flex-shrink-0">
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <span className="text-lg">📄</span>
            <div className="min-w-0">
              <DialogTitle className="text-sm truncate">{previewFile.nome}</DialogTitle>
              <DialogDescription className="text-xs">{previewFile.sizeStr}</DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button variant="default" size="sm" onClick={handleDownload} className="h-8 bg-blue-700 hover:bg-blue-800">
              <Download className="h-3.5 w-3.5 mr-1.5" /> Scarica
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPreviewFile(null)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-slate-100">
          {isPdf ? (
            // Usa il visualizzatore PDF nativo del browser (sempre funzionante)
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              title={previewFile.nome}
            />
          ) : isImage ? (
            <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
              <img
                src={previewUrl}
                alt={previewFile.nome}
                className="max-w-full max-h-full object-contain shadow-lg rounded bg-white"
              />
            </div>
          ) : (
            <div className="text-center text-slate-600 mt-12">
              <p className="font-medium mb-2">Anteprima non disponibile per questo tipo di file.</p>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> Scarica per visualizzarlo
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
