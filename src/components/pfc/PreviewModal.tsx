'use client'

import { usePfcStore } from '@/store/pfc'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, X, FileText, ExternalLink } from 'lucide-react'
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
      a.href = url; a.download = previewFile.nome
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`Download: ${previewFile.nome}`)
    } catch {
      toast.error('Errore download')
    }
  }

  return (
    <Dialog open={!!previewFile} onOpenChange={(o) => !o && setPreviewFile(null)}>
      <DialogContent className="!max-w-[100vw] !w-[100vw] !h-[100vh] !max-h-[100vh] sm:!max-w-[95vw] sm:!w-[95vw] sm:!h-[95vh] sm:!max-h-[95vh] flex flex-col p-0 gap-0 [&>button]:hidden rounded-none sm:rounded-lg">
        <DialogHeader className="px-3 sm:px-4 py-2 sm:py-2.5 border-b border-slate-200 flex-row items-center justify-between space-y-0 flex-shrink-0">
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <span className="text-base sm:text-lg flex-shrink-0">📄</span>
            <div className="min-w-0">
              <DialogTitle className="text-xs sm:text-sm truncate">{previewFile.nome}</DialogTitle>
              <DialogDescription className="text-[10px] sm:text-xs">{previewFile.sizeStr}</DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 sm:hidden" onClick={() => window.open(previewUrl, '_blank')}>
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button variant="default" size="sm" onClick={handleDownload} className="h-8 bg-blue-700 hover:bg-blue-800 text-xs">
              <Download className="h-3.5 w-3.5 mr-1" /> <span className="hidden sm:inline">Scarica</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPreviewFile(null)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-slate-100">
          {isPdf ? (
            <object data={previewUrl} type="application/pdf" className="w-full h-full">
              <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-4">
                <FileText className="h-12 w-12 text-slate-400" />
                <p className="text-sm text-slate-600 font-medium">Anteprima non disponibile</p>
                <div className="flex gap-2">
                  <Button variant="default" size="sm" onClick={() => window.open(previewUrl, '_blank')} className="bg-blue-700 hover:bg-blue-800">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Apri in nuova scheda
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleDownload}>
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Scarica
                  </Button>
                </div>
              </div>
            </object>
          ) : isImage ? (
            <div className="w-full h-full flex items-center justify-center p-2 sm:p-4 overflow-auto">
              <img src={previewUrl} alt={previewFile.nome} className="max-w-full max-h-full object-contain shadow-lg rounded bg-white" />
            </div>
          ) : (
            <div className="text-center text-slate-600 mt-12 p-4">
              <FileText className="h-10 w-10 mx-auto mb-2 text-slate-300" />
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
