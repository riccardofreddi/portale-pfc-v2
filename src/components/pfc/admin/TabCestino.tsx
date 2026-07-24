'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filtroCliente, setFiltroCliente] = useState('tutti')

  async function refresh() {
    setLoading(true)
    try {
      const r = await api.cestino.list()
      setFiles(r.files)
      setSelected(new Set())
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

  async function handleDeleteSelected() {
    const keys = Array.from(selected)
    if (keys.length === 0) return
    try {
      const r = await api.cestino.deleteMultiple(keys)
      toast.success(`${r.deleted} file eliminati definitivamente`)
      await refresh()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Errore') }
  }

  async function handleDeleteAll() {
    try {
      const r = await api.cestino.deleteAll()
      toast.success(`${r.deleted} file eliminati. Cestino svuotato.`)
      await refresh()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Errore') }
  }

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === filesFiltrati.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filesFiltrati.map((f) => f.key)))
    }
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>

  const clientiUnici = Array.from(new Set(files.map((f) => f.username))).sort()
  const filesFiltrati = filtroCliente === 'tutti' ? files : files.filter((f) => f.username === filtroCliente)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 flex-wrap gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-red-500" /> Cestino
          {files.length > 0 && <Badge variant="outline" className="text-xs border-red-300 text-red-600">{files.length} file</Badge>}
        </CardTitle>
        <div className="flex items-center gap-2">
          {clientiUnici.length > 1 && (
            <Select value={filtroCliente} onValueChange={(v) => setFiltroCliente(v ?? 'tutti')}>
              <SelectTrigger className="w-48 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti i clienti</SelectItem>
                {clientiUnici.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Aggiorna</Button>
          {files.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50 border-red-200">
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Svuota cestino
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Svuotare completamente il cestino?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tutti i {files.length} file nel cestino verranno eliminati definitivamente. Operazione irreversibile.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAll} className="bg-red-600 hover:bg-red-700">Svuota cestino</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {files.length === 0 ? (
          <div className="text-center py-12">
            <Trash2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-700 font-medium mb-1">Cestino vuoto</p>
            <p className="text-sm text-slate-500">I file eliminati verranno mostrati qui.</p>
          </div>
        ) : (
          <>
            {filesFiltrati.length > 0 && (
              <div className="flex items-center gap-3 mb-3 pb-3 border-b border-slate-200">
                <Checkbox
                  checked={selected.size === filesFiltrati.length && filesFiltrati.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-xs text-slate-600">
                  {selected.size > 0 ? `${selected.size} selezionati` : 'Seleziona tutti'}
                </span>
                {selected.size > 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50 ml-auto">
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Elimina selezionati ({selected.size})
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Eliminare {selected.size} file?</AlertDialogTitle>
                        <AlertDialogDescription>Operazione irreversibile. I file selezionati verranno eliminati definitivamente.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annulla</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteSelected} className="bg-red-600 hover:bg-red-700">Elimina</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}

            <div className="space-y-2">
              {filesFiltrati.map((f) => (
                <div key={f.key} className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg">
                  <Checkbox
                    checked={selected.has(f.key)}
                    onCheckedChange={() => toggleSelect(f.key)}
                  />
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
                          <AlertDialogDescription>Operazione irreversibile.</AlertDialogDescription>
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
          </>
        )}
      </CardContent>
    </Card>
  )
}
