'use client'

import { useEffect, useState } from 'react'
import { usePfcStore } from '@/store/pfc'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, X, Loader2, AlertTriangle, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

const FETCH_TIMEOUT_MS = 20000

export function PreviewModal() {
  const { previewFile, setPreviewFile } = usePfcStore()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  const isPdf = !!previewFile && previewFile.nome.toLowerCase().endsWith('.pdf')
  const isImage = !!previewFile && /\.(jpg|jpeg|png|svg|gif|webp)$/i.test(previewFile.nome)
  const rawPreviewUrl = previewFile ? `/api/documenti/preview?key=${encodeURIComponent(previewFile.key)}` : ''

  useEffect(() => {
    if (!previewFile) return
    let cancelled = false
    let objectUrl: string | null = null

    setStatus('loading')
    setErrorMsg('')
    setBlobUrl(null)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    fetch(rawPreviewUrl, { signal: controller.signal })
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          let msg = `Errore ${res.status} nel caricamento del file`
          try {
            const body = await res.json()
            if (body?.error) msg = body.error
          } catch {}
          setErrorMsg(msg)
          setStatus('error')
          return
        }
        const blob = await res.blob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setBlobUrl(objectUrl)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        const timedOut = err?.name === 'AbortError'
        setErrorMsg(timedOut ? 'Tempo scaduto durante il caricamento del file' : 'Errore di rete durante il caricamento del file')
        setStatus('error')
      })
      .finally(() => clearTimeout(timeoutId))

    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(timeoutId)
      if (objectUrl) URL.createObjectURL(objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewFile?.key])

  if (!previewFile) return null

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
        <DialogHeader className="px-4 py-2.5 border-b border-border flex-row items-center justify-between space-y-0 flex-shrink-0">
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

        <div className="flex-1 min-h-0 bg-muted relative">
          {status === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Caricamento anteprima…</p>
            </div>
          )}

          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
              <AlertTriangle className="h-8 w-8 text-red-600" />
              <p className="font-medium text-foreground max-w-md">{errorMsg}</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Scarica per visualizzarlo
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.open(rawPreviewUrl, '_blank')}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Apri in nuova scheda
                </Button>
              </div>
            </div>
          )}

          {status === 'ready' && blobUrl && isPdf && (
            <iframe
              src={blobUrl}
              className="w-full h-full border-0"
              title={previewFile.nome}
            />
          )}

          {status === 'ready' && blobUrl && isImage && (
            <div className="w-full h-full flex items-center justify-center p-4 overflow-auto">
              <img
                src={blobUrl}
                alt={previewFile.nome}
                className="max-w-full max-h-full object-contain shadow-lg rounded bg-white"
                onError={() => { setStatus('error'); setErrorMsg('Immagine non valida o corrotta') }}
              />
            </div>
          )}

          {status === 'ready' && blobUrl && !isPdf && !isImage && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6 text-muted-foreground">
              <p className="font-medium">Anteprima non disponibile per questo tipo di file.</p>
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
