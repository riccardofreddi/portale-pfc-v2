'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { formatDateAudit, formatBytes, ottieniIconaFile } from '@/lib/pfc-utils'
import { Loader2, Download, Trash2, RefreshCw, FileText, Inbox, Search } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface RispostaFile {
  key: string
  nome: string
  msgId: string
  username: string
  clienteNome: string
  size: number
  sizeStr: string
  lastModified: string | null
}

export function TabRisposte() {
  const [files, setFiles] = useState<RispostaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroCliente, setFiltroCliente] = useState<string>('tutti')
  const [searchQuery, setSearchQuery] = useState('')

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/risposte/list')
      if (!res.ok) throw new Error('Errore caricamento')
      const data = await res.json()
      setFiles(data.files ?? [])
    } catch (err) {
      toast.error('Errore caricamento file ricevuti')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  async function handleDownload(key: string, nome: string) {
    try {
      const res = await fetch(`/api/documenti/download?key=${encodeURIComponent(key)}`)
      if (!res.ok) throw new Error('Errore download')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nome
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`Download: ${nome}`)
    } catch {
      toast.error('Errore download')
    }
  }

  async function handleDelete(key: string) {
    try {
      const res = await fetch('/api/documenti/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: [key], moveToTrash: true }),
      })
      if (!res.ok) throw new Error('Errore eliminazione')
      setFiles((prev) => prev.filter((f) => f.key !== key))
      toast.success('File spostato nel cestino')
    } catch {
      toast.error('Errore eliminazione')
    }
  }

  // Estrai lista clienti unici per il filtro
  const clientiUnici = Array.from(new Set(files.map((f) => f.username)))
    .map((u) => {
      const f = files.find((x) => x.username === u)
      return { username: u, name: f?.clienteNome ?? u }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  // Filtra i file
  const filesFiltrati = files.filter((f) => {
    if (filtroCliente !== 'tutti' && f.username !== filtroCliente) return false
    if (searchQuery.trim() && !f.nome.toLowerCase().includes(searchQuery.toLowerCase().trim())) return false
    return true
  })

  const totalSize = filesFiltrati.reduce((s, f) => s + f.size, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Statistiche */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">File ricevuti</p>
              <FileText className="h-4 w-4 text-slate-400" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1">{files.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Clienti con file</p>
              <Inbox className="h-4 w-4 text-slate-400" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1">{clientiUnici.length}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Spazio totale</p>
              <FileText className="h-4 w-4 text-slate-400" />
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1">{formatBytes(totalSize)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald-600" /> File ricevuti dai clienti
          </CardTitle>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Aggiorna
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtri */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cerca per nome file..."
                className="pl-9"
              />
            </div>
            <Select value={filtroCliente} onValueChange={setFiltroCliente}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Tutti i clienti" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tutti">Tutti i clienti</SelectItem>
                {clientiUnici.map((c) => (
                  <SelectItem key={c.username} value={c.username}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Lista file */}
          {filesFiltrati.length === 0 ? (
            <div className="text-center py-12">
              <Inbox className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-700 font-medium mb-1">Nessun file ricevuto</p>
              <p className="text-sm text-slate-500">
                {files.length === 0
                  ? 'I file caricati dai clienti in risposta alle richieste appariranno qui'
                  : 'Nessun file corrisponde ai filtri selezionati'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filesFiltrati.map((f) => {
                const icon = ottieniIconaFile(f.nome)
                return (
                  <div
                    key={f.key}
                    className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-emerald-300 hover:shadow-sm transition-all"
                  >
                    <div
                      className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                      style={{ background: icon.bg, color: icon.fg }}
                    >
                      {icon.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-slate-900 truncate">{f.nome}</p>
                        <Badge variant="outline" className="text-xs">{f.sizeStr}</Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        da <span className="font-medium text-slate-700">{f.clienteNome}</span>
                        {f.lastModified && <span className="ml-2">· {formatDateAudit(f.lastModified)}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="outline" size="sm" onClick={() => handleDownload(f.key, f.nome)}>
                        <Download className="h-3.5 w-3.5 mr-1" /> Scarica
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 h-8 w-8 p-0">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Eliminare il file?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Il file verrà spostato nel cestino. Potrai recuperarlo da lì.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(f.key)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Elimina
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
