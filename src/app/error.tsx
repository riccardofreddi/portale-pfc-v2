'use client'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[GlobalError]', error) }, [error])
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 flex items-center justify-center mb-4">
          <AlertTriangle className="h-7 w-7 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Si e' verificato un errore</h2>
        <p className="text-sm text-slate-600 mb-6">La pagina non e' riuscita a caricarsi. Riprova o torna alla home.</p>
        {error?.message && (
          <p className="text-xs text-slate-400 mb-6 font-mono bg-slate-50 p-2 rounded border border-slate-200 break-all">{error.message}</p>
        )}
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button onClick={reset} className="bg-emerald-600 hover:bg-emerald-700"><RefreshCw className="h-4 w-4 mr-2" /> Riprova</Button>
          <Button variant="outline" onClick={() => (window.location.href = '/')}><Home className="h-4 w-4 mr-2" /> Home</Button>
        </div>
      </div>
    </div>
  )
}
