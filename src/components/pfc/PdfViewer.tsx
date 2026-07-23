'use client'

import { useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

export default function PdfViewer({ url }: { url: string }) {
  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function onDocumentLoadSuccess({ numPages: n }: { numPages: number }) {
    setNumPages(n)
    setLoading(false)
    setError(null)
  }

  function onDocumentLoadError(err: Error) {
    console.error('[PDF] errore:', err)
    setError('Impossibile caricare il documento PDF')
    setLoading(false)
  }

  return (
    <div className="flex flex-col items-center w-full">
      {loading && (<div className="flex items-center gap-2 text-slate-500 mt-12"><Loader2 className="h-5 w-5 animate-spin" /> Caricamento PDF...</div>)}
      {error && (<div className="text-center text-red-600 mt-12"><p className="font-medium">{error}</p></div>)}
      <Document file={url} onLoadSuccess={onDocumentLoadSuccess} onLoadError={onDocumentLoadError} loading={null} className="flex flex-col items-center">
        <Page pageNumber={pageNumber} renderTextLayer={false} renderAnnotationLayer={false} className="shadow-lg" width={Math.min(800, typeof window !== 'undefined' ? window.innerWidth - 80 : 800)} />
      </Document>
      {numPages > 1 && (
        <div className="sticky bottom-0 mt-4 px-4 py-2 border-t border-slate-200 flex items-center justify-center gap-3 bg-white shadow-lg rounded">
          <Button variant="outline" size="sm" disabled={pageNumber <= 1} onClick={() => setPageNumber((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm text-slate-700">Pagina {pageNumber} di {numPages}</span>
          <Button variant="outline" size="sm" disabled={pageNumber >= numPages} onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  )
}
