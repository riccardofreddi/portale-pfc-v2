'use client'

import { useState, useEffect, useRef } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Worker locale (no CDN, no CORS)
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf-worker/pdf.worker.min.mjs'

export default function PdfViewer({ url }: { url: string }) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [containerWidth, setContainerWidth] = useState<number>(800)
  const containerRef = useRef<HTMLDivElement | null>(null)

  function onDocumentLoadSuccess({ numPages: n }: { numPages: number }) {
    setNumPages(n)
    setLoading(false)
    setError(null)
  }

  function onDocumentLoadError(err: Error) {
    setError(`Impossibile caricare il PDF: ${err.message}`)
    setLoading(false)
  }

  useEffect(() => {
    function measure() {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth - 16
        if (w > 0) setContainerWidth(w)
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  function goToPrevPage() {
    setPageNumber((p) => Math.max(1, p - 1))
    if (containerRef.current) containerRef.current.scrollTop = 0
  }

  function goToNextPage() {
    setPageNumber((p) => Math.min(numPages, p + 1))
    if (containerRef.current) containerRef.current.scrollTop = 0
  }

  if (error) {
    return (
      <div className="text-center text-red-600 mt-12 max-w-md mx-auto p-4">
        <p className="font-medium mb-2">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => window.open(url, '_blank')}>
          Apri in nuova scheda
        </Button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex flex-col items-center w-full">
      {numPages > 1 && (
        <div className="sticky top-0 z-10 w-full bg-slate-100/95 backdrop-blur border-b border-slate-200 px-2 py-1.5 flex items-center justify-center gap-2 sm:gap-4 mb-3">
          <Button variant="outline" size="sm" disabled={pageNumber <= 1} onClick={goToPrevPage} className="h-7 text-xs px-2">
            <ChevronLeft className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Precedente</span>
          </Button>
          <span className="text-xs sm:text-sm text-slate-700 font-medium min-w-[100px] sm:min-w-[140px] text-center">
            Pagina {pageNumber} di {numPages}
          </span>
          <Button variant="outline" size="sm" disabled={pageNumber >= numPages} onClick={goToNextPage} className="h-7 text-xs px-2">
            <span className="hidden sm:inline">Successiva</span> <ChevronRight className="h-3.5 w-3.5 sm:ml-1" />
          </Button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center gap-3 text-slate-500 mt-12">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Caricamento PDF...</p>
        </div>
      )}

      {!loading && !error && (
        <div className="bg-white shadow-lg rounded">
          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={null}
            className="flex flex-col items-center"
          >
            <Page
              pageNumber={pageNumber}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              width={containerWidth}
            />
          </Document>
        </div>
      )}

      {!loading && !error && numPages > 1 && (
        <div className="w-full bg-slate-100/95 border-t border-slate-200 px-2 py-1.5 flex items-center justify-center gap-2 sm:gap-4 mt-3">
          <Button variant="outline" size="sm" disabled={pageNumber <= 1} onClick={goToPrevPage} className="h-7 text-xs px-2">
            <ChevronLeft className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Pagina precedente</span>
          </Button>
          <span className="text-xs sm:text-sm text-slate-700 font-medium min-w-[100px] sm:min-w-[140px] text-center">
            Pagina {pageNumber} di {numPages}
          </span>
          <Button variant="outline" size="sm" disabled={pageNumber >= numPages} onClick={goToNextPage} className="h-7 text-xs px-2">
            <span className="hidden sm:inline">Pagina successiva</span> <ChevronRight className="h-3.5 w-3.5 sm:ml-1" />
          </Button>
        </div>
      )}
    </div>
  )
}
