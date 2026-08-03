'use client'

import { useEffect } from 'react'
import { usePfcStore } from '@/store/pfc'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, X, FileText, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

export function PreviewModal() {
  const { previewFile, setPreviewFile } = usePfcStore()

  const isPdf = previewFile?.nome.toLowerCase().endsWith('.pdf') ?? false
  const isImage = previewFile ? /\.(jpg|jpeg|png|svg|gif|webp)$/i.test(previewFile.nome) : false
  const previewUrl = previewFile ? `/api/documenti/preview?key=${encodeURIComponent(previewFile.key)}` : ''

  // Auto-apertura su mobile: se è mobile e PDF, apri in nuova scheda e chiudi modal
  useEffect(() => {
    if (!previewFile || !isPdf) return

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 640
    
    if (isMobile) {
      window.open(previewUrl, '_blank')
      setPreviewFile(null)
    }
  }, [previewFile, isPdf, previewUrl, setPreviewFile])

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

  if (!previewFile) return null

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
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0 sm:hidden" onClick={() => window.open(previewUrl, '_blank')} aria-label="Apri in nuova scheda">
              <ExternalLink className="h-4.5 w-4.5" />
            </Button>
            <Button variant="default" size="sm" onClick={handleDownload} className="h-9 px-2.5 sm:px-3 bg-blue-700 hover:bg-blue-800 text-xs">
              <Download className="h-4 w-4 sm:h-3.5 sm:w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Scarica</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPreviewFile(null)} className="h-9 w-9 p-0 text-slate-500 hover:text-slate-800" aria-label="Chiudi">
              <X className="h-5 w-5" />
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
