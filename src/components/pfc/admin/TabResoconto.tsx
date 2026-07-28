'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { usePfcStore } from '@/store/pfc'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import { formatDateAudit, formatBytes, ottieniIconaFile } from '@/lib/pfc-utils'
import { Loader2, Database, HardDrive, Activity, RefreshCw, Trash2, ChevronDown, ChevronRight, Users, FileText, BarChart3, Eye, Download, Package } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

interface Diagnostica { db: { tabelle: Array<{ nome: string; righe: number }> }; r2: { configurato: boolean; nFiles: number; sizeTotale: number; errore: string | null } }
interface ResocontoFile { nome: string; key: string; size: number; sizeStr: string }
interface StatsCliente {
  username: string; name: string; exemptMaintenance: boolean; nFiles: number; sizeBytes: number; sizeStr: string;
  anni: { anno: string; cartelle: { cartella: string; nFiles: number; sizeBytes: number; files: ResocontoFile[] }[] }[]
}
interface AuditLog { id: string; ts: string; username: string; action: string; detail: string }

export function TabResoconto() {
  const { setPreviewFile } = usePfcStore()
  const [diagnostica, setDiagnostica] = useState<Diagnostica | null>(null)
  const [stats, setStats] = useState<StatsCliente[]>([])
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [openDiag, setOpenDiag] = useState(false)
  const [openCliente, setOpenCliente] = useState<string | null>(null)
  const [openCartella, setOpenCartella] = useState<string | null>(null)
  const [advancedStats, setAdvancedStats] = useState<{ topDocs: Array<{nome:string;count:number;username:string}>; topClienti: Array<{username:string;name:string;count:number}>; statsByAction: Array<{action:string;count:number}> } | null>(null)
  const [filtroAzione, setFiltroAzione] = useState<string>('tutte')
  const [filtroClienteLog, setFiltroClienteLog] = useState<string>('tutti')
  const [zippingAll, setZippingAll] = useState(false)

  async function refresh() {
    setLoading(true)
      const [d, r, l, s] = await Promise.all([api.sistema.diagnostica(), api.resoconto(), api.audit.list(200, filtroClienteLog !== 'tutti' ? filtroClienteLog : undefined, filtroAzione !== 'tutte' ? filtroAzione : undefined), fetch('/api/resoconto/stats').then(res => res.json()).catch(() => null)])
      const [d, r, l, s] = await Promise.all([api.sistema.diagnostica(), api.resoconto(), api.audit.list(200), fetch('/api/resoconto/stats').then(res => res.json()).catch(() => null)])
      setDiagnostica(d); setStats((r.stats ?? []) as unknown as StatsCliente[]); setLogs(l.logs); if (s) setAdvancedStats(s)
    } catch { toast.error('Errore caricamento resoconto') }
    finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  async function toggleExempt(username: string, currentExempt: boolean) {
    const newExempt = !currentExempt
    // Aggiornamento ottimistico UI
    setStats(prev => prev.map(c =>
      c.username === username ? { ...c, exemptMaintenance: newExempt } : c
    ))
    try {
      const res = await fetch('/api/clienti/exempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, exemptMaintenance: newExempt }),
      })
      if (!res.ok) throw new Error('Errore')
      const data = await res.json()
      setStats(prev => prev.map(c =>
        c.username === username ? { ...c, exemptMaintenance: data.exemptMaintenance } : c
      ))
      toast.success(`Esente da manutenzione ${data.exemptMaintenance ? 'attivato' : 'disattivato'}`)
    } catch {
      // Rollback in caso di errore
      setStats(prev => prev.map(c =>
        c.username === username ? { ...c, exemptMaintenance: currentExempt } : c
      ))
      toast.error('Errore aggiornamento esente')
    }
  }

  async function handleResetLogCliente(username: string) {
    try {
      await fetch('/api/audit?username=' + username, { method: 'DELETE' })
      toast.success('Cronologia di ' + username + ' azzerata')
      await refresh()
    } catch { toast.error('Errore reset cronologia cliente') }
  }

  async function handleResetLog() {
    try { await api.audit.reset(); toast.success('Log azzerato'); await refresh() }
    catch { toast.error('Errore reset log') }
  }

  async function handleDownload(key: string, nome: string) {
    try {
      const res = await fetch(`/api/documenti/download?key=${encodeURIComponent(key)}`)
      if (!res.ok) throw new Error('Errore download')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = nome
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`Download: ${nome}`)
    } catch { toast.error('Errore download') }
  }

  async function handleBackupAll() {
    setZippingAll(true)
    const toastId = toast.loading('Creazione backup completo di tutti i documenti...')
    try {
      const res = await fetch('/api/documenti/zip-all')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Errore ' + res.status)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'backup_completo_' + new Date().toISOString().slice(0, 10) + '.zip'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup scaricato: ' + a.download + ' (' + formatBytes(blob.size) + ')', { id: toastId })
    } catch (err) {
      toast.error('Errore backup: ' + (err instanceof Error ? err.message : 'errore'), { id: toastId })
    } finally {
      setZippingAll(false)
    }
  }

  async function handleExportCsv() {
    try {
      const res = await fetch('/api/audit/csv')
      if (!res.ok) throw new Error('Errore export')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'audit_log_' + new Date().toISOString().slice(0, 10) + '.csv'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Log esportato in CSV')
    } catch {
      toast.error('Errore export CSV')
    }
  }

  if (loading) return (<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>)

  const totalFiles = stats.reduce((s, c) => s + c.nFiles, 0)
  const totalSize = stats.reduce((s, c) => s + c.sizeBytes, 0)
  const avgFiles = stats.length > 0 ? (totalFiles / stats.length).toFixed(1) : '0'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Statistiche generali</p>
            <Button variant="outline" size="sm" onClick={handleExportCsv} className="border-blue-300 text-blue-700 hover:bg-blue-50">
              <FileText className="h-3.5 w-3.5 mr-1.5" /> Esporta CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleBackupAll} disabled={zippingAll} className="border-emerald-300 text-emerald-700 hover:bg-emerald-50">
              {zippingAll ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Package className="h-3.5 w-3.5 mr-1.5" />}
              {zippingAll ? 'Creazione backup...' : 'Backup completo (ZIP)'}
            </Button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-emerald-500"><CardContent className="pt-5"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Clienti</p><Users className="h-4 w-4 text-slate-400" /></div><p className="text-2xl font-bold text-slate-900 mt-1">{stats.length}</p></CardContent></Card>
        <Card className="border-l-4 border-l-blue-500"><CardContent className="pt-5"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Totale file</p><FileText className="h-4 w-4 text-slate-400" /></div><p className="text-2xl font-bold text-slate-900 mt-1">{totalFiles}</p></CardContent></Card>
        <Card className="border-l-4 border-l-purple-500"><CardContent className="pt-5"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Spazio</p><HardDrive className="h-4 w-4 text-slate-400" /></div><p className="text-2xl font-bold text-slate-900 mt-1">{formatBytes(totalSize)}</p></CardContent></Card>
        <Card className="border-l-4 border-l-amber-500"><CardContent className="pt-5"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Media file/cliente</p><BarChart3 className="h-4 w-4 text-slate-400" /></div><p className="text-2xl font-bold text-slate-900 mt-1">{avgFiles}</p></CardContent></Card>
      </div>

      <Collapsible open={openDiag} onOpenChange={setOpenDiag}>
        <Card>
          <CollapsibleTrigger className="block w-full text-left p-6 cursor-pointer hover:bg-slate-50 transition-colors">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2"><Activity className="h-5 w-5 text-emerald-600" /> Stato del Sistema</span>
              {openDiag ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </CardTitle>
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
                  </div>
                ) : <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">R2 non configurato.</div>}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2"><Database className="h-4 w-4" /> Database</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {diagnostica?.db.tabelle.map((t) => <div key={t.nome} className="bg-white border border-slate-200 rounded p-3 text-sm"><p className="text-xs text-slate-500">{t.nome}</p><p className="font-semibold text-slate-900">{t.righe} righe</p></div>)}
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
{/* Statistiche avanzate (ultimi 30gg) */}
        {advancedStats && (advancedStats.topDocs.length > 0 || advancedStats.topClienti.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-600" /> Top 5 Documenti Scaricati (30gg)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {advancedStats.topDocs.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">Nessun download negli ultimi 30 giorni</p>
                ) : (
                  <div className="space-y-2">
                    {advancedStats.topDocs.map((d, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                        <span className="flex-1 truncate text-slate-700">{d.nome}</span>
                        <span className="text-xs font-semibold text-slate-500 flex-shrink-0">{d.count}x</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-600" /> Top 5 Clienti Attivi (30gg)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {advancedStats.topClienti.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">Nessuna attività negli ultimi 30 giorni</p>
                ) : (
                  <div className="space-y-2">
                    {advancedStats.topClienti.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                        <span className="flex-1 truncate text-slate-700">{c.name}</span>
                        <span className="text-xs font-semibold text-slate-500 flex-shrink-0">{c.count} azioni</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-5 w-5 text-emerald-600" /> Archivio per Cliente</CardTitle></CardHeader>
        <CardContent>
          {stats.length === 0 ? <p className="text-sm text-slate-500 text-center py-6">Nessun cliente</p> : (
            <div className="space-y-2">
              {stats.map((c) => (
                <Collapsible key={c.username} open={openCliente === c.username} onOpenChange={(o) => setOpenCliente(o ? c.username : null)}>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <CollapsibleTrigger className="w-full flex items-center justify-between p-3 hover:bg-slate-50 text-left">
                      <div className="flex items-center gap-2 min-w-0">
                        {openCliente === c.username ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <p className="font-semibold text-slate-900 truncate">{c.name}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 flex-shrink-0">
                        {c.exemptMaintenance ? (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleExempt(c.username, c.exemptMaintenance) }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); toggleExempt(c.username, c.exemptMaintenance) } }}
                            className="px-2.5 py-1 rounded-md text-sm font-semibold bg-amber-100 border border-amber-500 text-amber-800 cursor-pointer hover:bg-amber-200 transition-colors"
                            title="Esente da manutenzione attivo - clicca per disattivare"
                          >
                            Esente
                          </span>
                        ) : (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleExempt(c.username, c.exemptMaintenance) }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); toggleExempt(c.username, c.exemptMaintenance) } }}
                            className="px-2.5 py-1 rounded-md text-sm font-medium text-slate-300 cursor-pointer hover:text-amber-700 hover:bg-amber-50 transition-colors"
                            title="Non esente - clicca per attivare"
                          >
                            Esente
                          </span>
                        )}
                        <span>{c.nFiles} file</span>
                        <span>{c.sizeStr}</span>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t border-slate-200 p-3 space-y-3 bg-slate-50/50">
                        {c.anni.length === 0 ? <p className="text-sm text-slate-500 italic">Archivio vuoto</p> : c.anni.map((a) => (
                          <div key={a.anno}>
<p className="text-sm font-semibold text-slate-800 mb-2">Anno {a.anno}</p>
                            <div className="space-y-2 pl-4">
                              {a.cartelle.map((cart) => {
                                const cartKey = `${c.username}_${a.anno}_${cart.cartella}`
                                const isCartOpen = openCartella === cartKey
                                return (
                                  <Collapsible key={cartKey} open={isCartOpen} onOpenChange={(o) => setOpenCartella(o ? cartKey : null)}>
                                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                                      <CollapsibleTrigger className="w-full flex items-center justify-between p-2 hover:bg-slate-50 text-left text-sm">
                                        <div className="flex items-center gap-2">
                                          {isCartOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                          <span className="font-medium">{cart.cartella}</span>
                                        </div>
                                        <span className="text-xs text-slate-500">{cart.nFiles} file - {formatBytes(cart.sizeBytes)}</span>
                                      </CollapsibleTrigger>
                                      <CollapsibleContent>
                                        <div className="border-t border-slate-200 p-2 space-y-1 bg-slate-50/30">
                                          {cart.files.map((f) => {
                                            const icon = ottieniIconaFile(f.nome)
                                            return (
                                              <div key={f.key} className="flex items-center gap-3 p-2 bg-white border border-slate-200 rounded-lg">
                                                <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm" style={{ background: icon.bg, color: icon.fg }}>
                                                  {icon.icon}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                  <p className="text-sm font-medium text-slate-900 truncate">{f.nome}</p>
                                                  <p className="text-xs text-slate-500">{f.sizeStr}</p>
                                                </div>
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                  <Button variant="outline" size="sm" onClick={() => setPreviewFile({ nome: f.nome, key: f.key, size: f.size, sizeStr: f.sizeStr, lastModified: null, stato: 'nuovo', isPreferito: false })}>
                                                    <Eye className="h-3.5 w-3.5 mr-1" /> Visualizza
                                                  </Button>
                                                  <Button variant="outline" size="sm" onClick={() => handleDownload(f.key, f.nome)}>
                                                    <Download className="h-3.5 w-3.5 mr-1" /> Scarica
                                                  </Button>
                                                </div>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </CollapsibleContent>
                                    </div>
                                  </Collapsible>
                                )
                              })}
                            </div>
                          </div>
                        ))}
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
<CardTitle className="text-base flex items-center gap-2"><Activity className="h-5 w-5 text-emerald-600" /> Log Attivita ({logs.length})</CardTitle>
<div className="flex items-center gap-2 flex-wrap">
                  <Select value={filtroClienteLog} onValueChange={(v) => { setFiltroClienteLog(v ?? 'tutti'); setTimeout(refresh, 0) }}>
                    <SelectTrigger className="w-40 h-7 text-xs"><SelectValue placeholder="Cliente" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tutti">Tutti i clienti</SelectItem>
                      {stats.map((c) => (<SelectItem key={c.username} value={c.username}>{c.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                  <Select value={filtroAzione} onValueChange={(v) => { setFiltroAzione(v ?? 'tutte'); setTimeout(refresh, 0) }}>
                    <SelectTrigger className="w-40 h-7 text-xs"><SelectValue placeholder="Azione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tutte">Tutte le azioni</SelectItem>
                      <SelectItem value="LOGIN_SUCCESS">Login</SelectItem>
                      <SelectItem value="DOWNLOAD_DOC">Download doc</SelectItem>
                      <SelectItem value="UPLOAD_CASSETTO">Upload cassetto</SelectItem>
                      <SelectItem value="UPLOAD_RISPOSTA">Upload risposta</SelectItem>
                      <SelectItem value="SCARICA_ARCHIVIO">Scarica archivio</SelectItem>
                    </SelectContent>
                  </Select>
                  {filtroClienteLog !== 'tutti' && (
                    <Button variant="outline" size="sm" className="h-7 text-xs text-red-600 hover:bg-red-50 border-red-200" onClick={() => handleResetLogCliente(filtroClienteLog)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Cancella cronologia cliente
                    </Button>
                  )}
                </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh}><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Aggiorna</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50 border-red-200"><Trash2 className="h-3.5 w-3.5 mr-1.5" /> Azzera</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Azzerare il log?</AlertDialogTitle><AlertDialogDescription>Tutti i record verranno eliminati.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Annulla</AlertDialogCancel><AlertDialogAction onClick={handleResetLog} className="bg-red-600 hover:bg-red-700">Azzera</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? <p className="text-sm text-slate-500 text-center py-6">Nessuna attivita</p> : (
            <div className="max-h-96 overflow-y-auto border border-slate-200 rounded">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0"><tr><th className="text-left p-2 font-medium text-slate-600">Data</th><th className="text-left p-2 font-medium text-slate-600">Utente</th><th className="text-left p-2 font-medium text-slate-600">Azione</th><th className="text-left p-2 font-medium text-slate-600 hidden md:table-cell">Dettaglio</th></tr></thead>
                <tbody>{logs.map((l) => (<tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50"><td className="p-2 text-xs text-slate-500 whitespace-nowrap">{formatDateAudit(l.ts)}</td><td className="p-2 font-mono text-xs">{l.username}</td><td className="p-2"><Badge variant="outline" className="text-xs">{l.action}</Badge></td><td className="p-2 text-xs text-slate-600 hidden md:table-cell max-w-xs truncate">{l.detail}</td></tr>))}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
