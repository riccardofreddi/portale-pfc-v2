'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import { Loader2, Trash2, RotateCcw, RefreshCw } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

interface CestinoFile {
  key: string; nome: string; username: string; anno: string;
  cartella: string; originalKey: string; size: number; sizeStr: string; lastModified: Date | null
}

export function TabCestino() {
  const [files, setFiles] = useState<CestinoFile[]>([])
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setLoading(true)
    try {
      const r = await api.cestino.list()
      setFiles(r.files)
    } catch { toast.error('Errore caricamento cestino') }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  async function handleRecover(key: string) {
    try { await api.cestino.recover(key); toast.success('File ripristinato nel path originale'); await refresh() }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Errore') }
  }

  async function handleDeletePermanent(key: string) {
    try { await api.cestino.deletePermanent(key); toast.success('File eliminato definitivamente'); await refresh() }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Errore') }
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-red-500" /> Cestino
          {files.length > 0 && <Badge variant="outline" className="text-xs border-red-300 text-red-600">{files.length} file</Badge>}
        </CardTitle>
        <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Aggiorna</Button>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <div className="text-center py-12">
            <Trash2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-700 font-medium mb-1">Cestino vuoto</p>
            <p className="text-sm text-slate-500">I file eliminati verranno mostrati qui. Potrai ripristinarli o eliminarli definitivamente.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((f) => (
              <div key={f.key} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-xl bg-red-50 text-red-600">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-slate-900 truncate">{f.nome}</p>
                  <p className="text-xs text-slate-500">
                    {f.username} · {f.anno} · {f.cartella} · {f.sizeStr}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="outline" size="sm" onClick={() => handleRecover(f.key)} className="text-emerald-600 hover:bg-emerald-50">
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Ripristina
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Elimina
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Eliminare {f.nome}?</AlertDialogTitle>
                        <AlertDialogDescription>Operazione irreversibile. Il file verra eliminato definitivamente dal cloud.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeletePermanent(f.key)} className="bg-red-600 hover:bg-red-700">Elimina</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
