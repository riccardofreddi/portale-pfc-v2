'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import { formatDateAudit, formatBytes } from '@/lib/pfc-utils'
import { Loader2, Database, HardDrive, Activity, RefreshCw, Trash2, ChevronDown, ChevronRight, Users, FileText, BarChart3 } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

interface Diagnostica { db: { tabelle: Array<{ nome: string; righe: number }> }; r2: { configurato: boolean; nFiles: number; sizeTotale: number; errore: string | null } }
interface StatsCliente { username: string; name: string; nFiles: number; sizeBytes: number; sizeStr: string; anni: { anno: string; cartelle: { cartella: string; nFiles: number; sizeBytes: number }[] }[] }
interface AuditLog { id: string; ts: string; username: string; action: string; detail: string }

export function TabResoconto() {
  const [diagnostica, setDiagnostica] = useState<Diagnostica | null>(null)
  const [stats, setStats] = useState<StatsCliente[]>([])
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [openDiag, setOpenDiag] = useState(false)
  const [openCliente, setOpenCliente] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    try {
      const [d, r, l] = await Promise.all([api.sistema.diagnostica(), api.resoconto(), api.audit.list(200)])
      setDiagnostica(d); setStats((r.stats ?? []) as unknown as StatsCliente[]); setLogs(l.logs)
    } catch { toast.error('Errore caricamento resoconto') }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  async function handleResetLog() {
    try { await api.audit.reset(); toast.success('Log azzerato'); await refresh() }
    catch { toast.error('Errore reset log') }
  }

  if (loading) return (<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>)

  const totalFiles = stats.reduce((s, c) => s + c.nFiles, 0)
  const totalSize = stats.reduce((s, c) => s + c.sizeBytes, 0)
  const avgFiles = stats.length > 0 ? (totalFiles / stats.length).toFixed(1) : '0'

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-emerald-500"><CardContent className="pt-5"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Clienti</p><Users className="h-4 w-4 text-slate-400" /></div><p className="text-2xl font-bold text-slate-900 mt-1">{stats.length}</p></CardContent></Card>
        <Card className="border-l-4 border-l-blue-500"><CardContent className="pt-5"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Totale file</p><FileText className="h-4 w-4 text-slate-400" /></div><p className="text-2xl font-bold text-slate-900 mt-1">{totalFiles}</p></CardContent></Card>
        <Card className="border-l-4 border-l-purple-500"><CardContent className="pt-5"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Spazio</p><HardDrive className="h-4 w-4 text-slate-400" /></div><p className="text-2xl font-bold text-slate-900 mt-1">{formatBytes(totalSize)}</p></CardContent></Card>
        <Card className="border-l-4 border-l-amber-500"><CardContent className="pt-5"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Media file/cliente</p><BarChart3 className="h-4 w-4 text-slate-400" /></div><p className="text-2xl font-bold text-slate-900 mt-1">{avgFiles}</p></CardContent></Card>
      </div>
      <Collapsible open={openDiag} onOpenChange={setOpenDiag}>
        <Card>
          <CollapsibleTrigger>
            <CardHeader className="cursor-pointer hover:bg-slate-50 transition-colors">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2"><Activity className="h-5 w-5 text-emerald-600" /> Stato del Sistema</span>
                {openDiag ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2"><HardDrive className="h-4 w-4" /> Cloudflare R2</h4>
                {diagnostica?.r2.configurato ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                    <div className="bg-emerald-50 border border-emerald-200 rounded p-3"><p className="text-xs text-slate-500">Stato</p><p className="font-semibold text-emerald-700">Configurato</p></div>
                    <div className="bg-white border border-slate-200 rounded p-3"><p className="text-xs text-slate-500">File totali</p><p className="font-semibold text-slate-900">{diagnostica.r2.nFiles}</p></div>
                    <div className="bg-white border border-slate-200 rounded p-3"><p className="text-xs text-slate-500">Spazio</p><p className="font-semibold text-slate-900">{formatBytes(diagnostica.r2.sizeTotale)}</p></div>
                    {diagnostica.r2.errore && <div className="col-span-full bg-red-50 border border-red-200 rounded p-3 text-xs text-red-700">Errore: {diagnostica.r2.errore}</div>}
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">R2 non configurato.</div>
                )}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2"><Database className="h-4 w-4" /> Database</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {diagnostica?.db.tabelle.map((t) => (
                    <div key={t.nome} className="bg-white border border-slate-200 rounded p-3 text-sm"><p className="text-xs text-slate-500">{t.nome}</p><p className="font-semibold text-slate-900">{t.righe} righe</p></div>
                  ))}
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-5 w-5 text-emerald-600" /> Archivio per Cliente</CardTitle></CardHeader>
        <CardContent>
          {stats.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">Nessun cliente</p>
          ) : (
            <div className="space-y-2">
              {stats.map((c) => (
                <Collapsible key={c.username} open={openCliente === c.username} onOpenChange={(o) => setOpenCliente(o ? c.username : null)}>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <CollapsibleTrigger>
                      <div className="w-full flex items-center justify-between p-3 hover:bg-slate-50 text-left cursor-pointer">
                        <div className="flex items-center gap-2 min-w-0">
                          {openCliente === c.username ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          <p className="font-semibold text-slate-900 truncate">{c.name}</p>
                          <span className="text-xs text-slate-500">@{c.username}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 flex-shrink-0"><span>{c.nFiles} file</span><span>{c.sizeStr}</span></div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t border-slate-200 p-3 space-y-3 bg-slate-50/50">
                        {c.anni.length === 0 ? (
                          <p className="text-sm text-slate-500 italic">Archivio vuoto</p>
                        ) : (
                          c.anni.map((a) => (
                            <div key={a.anno}>
                              <p className="text-sm font-semibold text-slate-800 mb-1">Anno {a.anno}</p>
                              <div className="space-y-1 pl-4">
                                {a.cartelle.map((cart) => (
                                  <div key={cart.cartella} className="flex items-center justify-between text-sm">
                                    <span><strong>{cart.cartella}</strong></span>
                                    <span className="text-xs text-slate-500">{cart.nFiles} file - {formatBytes(cart.sizeBytes)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2"><Activity className="h-5 w-5 text-emerald-600" /> Log Attivita Clienti ({logs.length})</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Aggiorna</Button>
            <AlertDialog>
              <AlertDialogTrigger>
                <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50 border-red-200"><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Azzera</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Azzerare il log attivita?</AlertDialogTitle>
                  <AlertDialogDescription>Tutti i record del log verranno eliminati definitivamente.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction onClick={handleResetLog} className="bg-red-600 hover:bg-red-700">Azzera log</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">Nessuna attivita registrata</p>
          ) : (
            <div className="max-h-96 overflow-y-auto border border-slate-200 rounded">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium text-slate-600">Data</th>
                    <th className="text-left p-2 font-medium text-slate-600">Utente</th>
                    <th className="text-left p-2 font-medium text-slate-600">Azione</th>
                    <th className="text-left p-2 font-medium text-slate-600 hidden md:table-cell">Dettaglio</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="p-2 text-xs text-slate-500 whitespace-nowrap">{formatDateAudit(l.ts)}</td>
                      <td className="p-2 font-mono text-xs">{l.username}</td>
                      <td className="p-2"><Badge variant="outline" className="text-xs">{l.action}</Badge></td>
                      <td className="p-2 text-xs text-slate-600 hidden md:table-cell max-w-xs truncate">{l.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
