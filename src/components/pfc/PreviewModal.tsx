'use client'

import { useState, useEffect } from 'react'
import { usePfcStore } from '@/store/pfc'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, X, ChevronLeft, ChevronRight, Loader2, FileText } from 'lucide-react'
import { toast } from 'sonner'

export function PreviewModal() {
  const { previewFile, setPreviewFile } = usePfcStore()
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isPdf = previewFile?.nome.toLowerCase().endsWith('.pdf') ?? false
  const isImage = previewFile ? /\.(jpg|jpeg|png|svg|gif|webp)$/i.test(previewFile.nome) : false

  const pdfPageUrl = previewFile
    ? `/api/documenti/pdf-page?key=${encodeURIComponent(previewFile.key)}&page=${currentPage}`
    : ''
  const previewUrl = previewFile
    ? `/api/documenti/preview?key=${encodeURIComponent(previewFile.key)}`
    : ''

  useEffect(() => {
    if (!previewFile) return
    setNumPages(0)
    setCurrentPage(1)
    setLoading(true)
    setError(null)
  }, [previewFile])

  // Per PDF: carica la prima pagina per ottenere il numero totale
  useEffect(() => {
    if (!previewFile || !isPdf) return
    setLoading(true)
    fetch(`/api/documenti/pdf-page?key=${encodeURIComponent(previewFile.key)}&page=1`)
      .then((res) => {
        if (!res.ok) throw new Error('Errore caricamento')
        const total = parseInt(res.headers.get('X-Total-Pages') ?? '1', 10)
        setNumPages(total)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [previewFile, isPdf])

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
        {/* Header */}
        <DialogHeader className="px-3 sm:px-4 py-2 sm:py-2.5 border-b border-slate-200 flex-row items-center justify-between space-y-0 flex-shrink-0">
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <span className="text-base sm:text-lg flex-shrink-0">📄</span>
            <div className="min-w-0">
              <DialogTitle className="text-xs sm:text-sm truncate">{previewFile.nome}</DialogTitle>
              <DialogDescription className="text-[10px] sm:text-xs">{previewFile.sizeStr}</DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
            <Button variant="default" size="sm" onClick={handleDownload} className="h-8 bg-blue-700 hover:bg-blue-800 text-xs">
              <Download className="h-3.5 w-3.5 mr-1" /> <span className="hidden sm:inline">Scarica</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPreviewFile(null)} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Navigazione pagine SOPRA (come Streamlit) */}
        {isPdf && numPages > 1 && !loading && !error && (
          <div className="bg-slate-100 border-b border-slate-200 px-3 py-1.5 flex items-center justify-center gap-3 flex-shrink-0">
            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className="h-7 text-xs">
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Prec
            </Button>
            <span className="text-xs text-slate-700 font-medium min-w-[100px] text-center">
              Pagina {currentPage} di {numPages}
            </span>
            <Button variant="outline" size="sm" disabled={currentPage >= numPages} onClick={() => setCurrentPage(p => p + 1)} className="h-7 text-xs">
              Succ <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        )}

        {/* Contenuto */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-slate-100 flex items-start justify-center p-2 sm:p-4">
          {isPdf ? (
            loading ? (
              <div className="flex flex-col items-center gap-3 text-slate-500 mt-12">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-sm">Caricamento pagina...</p>
              </div>
            ) : error ? (
              <div className="text-center text-red-600 mt-12 p-4">
                <p className="font-medium mb-2">{error}</p>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Scarica il file
                </Button>
              </div>
            ) : (
              <div className="bg-white shadow-lg rounded">
                <img
                  src={pdfPageUrl}
                  alt={`Pagina ${currentPage}`}
                  className="w-full h-auto"
                  onError={() => setError('Errore caricamento pagina')}
                />
              </div>
            )
          ) : isImage ? (
            <img src={previewUrl} alt={previewFile.nome} className="max-w-full max-h-full object-contain shadow-lg rounded bg-white" />
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

        {/* Navigazione pagine SOTTO (come Streamlit) */}
        {isPdf && numPages > 1 && !loading && !error && (
          <div className="bg-slate-100 border-t border-slate-200 px-3 py-1.5 flex items-center justify-center gap-3 flex-shrink-0">
            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className="h-7 text-xs">
              <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Pagina precedente
            </Button>
            <span className="text-xs text-slate-700 font-medium min-w-[100px] text-center">
              Pagina {currentPage} di {numPages}
            </span>
            <Button variant="outline" size="sm" disabled={currentPage >= numPages} onClick={() => setCurrentPage(p => p + 1)} className="h-7 text-xs">
              Pagina successiva <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
