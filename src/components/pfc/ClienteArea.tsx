'use client'

import { useEffect, useState } from 'react'
import { usePfcStore } from '@/store/pfc'
import { TopBar } from './TopBar'
import { ClienteArchivio } from './cliente/ClienteArchivio'
import { ClienteMessaggi } from './cliente/ClienteMessaggi'
import { ClienteAvvisi } from './cliente/ClienteAvvisi'
import { ClienteCassetto } from './cliente/ClienteCassetto'
import { ClienteAttivita } from './cliente/ClienteAttivita'
import { FolderOpen, MessageSquare, Megaphone, Bell, Briefcase, ClipboardList, Check, Trash2, BellOff, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { formatDateAudit } from '@/lib/pfc-utils'

interface Notifica {
  id: string; type: string; text: string; detail: string;
  ts: string; read: boolean; year?: string | null; folder?: string | null
}

const NOTIF_ICONS: Record<string, string> = {
  documento_nuovo: '📄', messaggio: '💬', avviso: '📢',
  richiesta_upload: '📤', upload_confermato: '✅',
}

const NOTIF_STYLES: Record<string, { bg: string; border: string; iconBg: string; text: string; label: string }> = {
  documento_nuovo: { bg: 'linear-gradient(135deg,#dbeafe,#eff6ff)', border: '#3b82f6', iconBg: '#3b82f6', text: '#1e40af', label: 'DOCUMENTO' },
  messaggio: { bg: 'linear-gradient(135deg,#dcfce7,#f0fdf4)', border: '#16a34a', iconBg: '#16a34a', text: '#15803d', label: 'MESSAGGIO' },
  avviso: { bg: 'linear-gradient(135deg,#fef3c7,#fffbeb)', border: '#f59e0b', iconBg: '#f59e0b', text: '#92400e', label: 'AVVISO' },
  richiesta_upload: { bg: 'linear-gradient(135deg,#fce7f3,#fdf2f8)', border: '#ec4899', iconBg: '#ec4899', text: '#9f1239', label: 'RICHIESTA' },
  upload_confermato: { bg: 'linear-gradient(135deg,#ede9fe,#f5f3ff)', border: '#8b5cf6', iconBg: '#8b5cf6', text: '#6d28d9', label: 'RICEVUTO' },
}

const DEFAULT_NOTIF_STYLE = { bg: '#f8fafc', border: '#94a3b8', iconBg: '#94a3b8', text: '#475569', label: 'NOTIFICA' }

const FILTRI = [
  { id: 'tutte', label: 'Tutte' },
  { id: 'non_lette', label: 'Non lette' },
  { id: 'documento_nuovo', label: 'Documenti' },
  { id: 'messaggio', label: 'Messaggi' },
  { id: 'avviso', label: 'Avvisi' },
] as const

const TABS = [
  { id: 'archivio', label: 'Archivio Documenti', icon: FolderOpen },
  { id: 'cassetto', label: 'Cassetto Digitale', icon: Briefcase },
  { id: 'messaggi', label: 'Messaggi', icon: MessageSquare },
  { id: 'avvisi', label: 'Avvisi', icon: Megaphone },
  { id: 'attivita', label: 'Le mie attività', icon: ClipboardList },
] as const

const PAGE_SIZE = 10

export function ClienteArea() {
  const { user, clienteTab, setClienteTab, setAnno, setCartella } = usePfcStore()
  const [nNotifiche, setNNotifiche] = useState(0)
  const [notifiche, setNotifiche] = useState<Notifica[]>([])
  const [showNotifPanel, setShowNotifPanel] = useState(false)
  const [filtroNotif, setFiltroNotif] = useState<string>('tutte')
  const [pageNotif, setPageNotif] = useState(1)
  const [nMsgNonLetti, setNMsgNonLetti] = useState(0)
  const [avvisi, setAvvisi] = useState<Array<{ id: string; text: string; timestamp: string }>>([])
  const [maintenance, setMaintenance] = useState(false)

  async function loadNotifiche() {
    if (!user) return
    try {
      const [n, m, a, maint] = await Promise.all([
        api.notifiche.list(),
        api.messaggi.list(user.username).catch(() => ({ messaggi: [] })),
        api.avvisi.list().catch(() => ({ avvisi: [] })),
        api.sistema.manutenzione.get().catch(() => ({ attivo: false })),
      ])
      const notifs = (n.notifiche as unknown as Notifica[])
      setNotifiche(notifs)
      setNNotifiche(notifs.filter((x) => !x.read).length)
      setNMsgNonLetti((m.messaggi as unknown as Array<{ read: boolean }>).filter((x) => !x.read).length)
      setAvvisi(a.avvisi)
      setMaintenance(maint.attivo)
    } catch {}
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadNotifiche()
  }, [user, clienteTab])

  useEffect(() => { setPageNotif(1) }, [filtroNotif])

  async function handleSegnaLette(id?: string) {
    try {
      await api.notifiche.segnaLette(id)
      if (id) { setNotifiche((curr) => curr.map((n) => n.id === id ? { ...n, read: true } : n)) }
      else { setNotifiche((curr) => curr.map((n) => ({ ...n, read: true }))) }
      setNNotifiche(0)
      toast.success(id ? 'Notifica segnata come letta' : 'Notifiche segnate come lette')
    } catch { toast.error('Errore') }
  }

  async function handlePulisciLette() {
    try { await api.notifiche.pulisciLette(); setNotifiche((curr) => curr.filter((n) => !n.read)); toast.success('Notifiche lette pulite') }
    catch { toast.error('Errore') }
  }

  async function handlePulisciTutte() {
    try { await api.notifiche.pulisciTutte(); setNotifiche([]); setNNotifiche(0); toast.success('Tutte le notifiche cancellate') }
    catch { toast.error('Errore') }
  }

  function handleNotificaClick(n: Notifica) {
    if (!n.read) handleSegnaLette(n.id)
    if (n.type === 'documento_nuovo' && n.year && n.folder) { setAnno(n.year); setCartella(n.folder); setClienteTab('archivio') }
    else if (n.type === 'messaggio' || n.type === 'richiesta_upload') { setClienteTab('messaggi') }
    else if (n.type === 'avviso') { setClienteTab('avvisi') }
    setShowNotifPanel(false)
  }

  if (!user) return null

  // BLOCCO MANUTENZIONE
  if (maintenance && !user.exemptMaintenance) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <TopBar />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="text-center bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-400 rounded-3xl p-8 sm:p-12 max-w-2xl shadow-xl">
            <div className="text-6xl mb-6">🚧</div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-amber-900 mb-4">App in aggiornamento</h2>
            <p className="text-amber-800 text-base sm:text-lg leading-relaxed mb-6">
              Stiamo svolgendo operazioni di manutenzione per migliorare il servizio.<br/>
              Tornerai a poter accedere ai tuoi documenti a breve.
            </p>
            <div className="border-t border-amber-300 pt-6 mt-6">
              <p className="text-amber-700 text-sm">
                Per urgenze, contatta lo studio.<br/>
                Grazie per la pazienza. 🙏
              </p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const nLette = notifiche.filter((n) => n.read).length
  const notificheFiltrate = notifiche.filter((n) => {
    if (filtroNotif === 'tutte') return true
    if (filtroNotif === 'non_lette') return !n.read
    return n.type === filtroNotif
  })
  const totalPagesNotif = Math.ceil(notificheFiltrate.length / PAGE_SIZE)
  const startNotif = (pageNotif - 1) * PAGE_SIZE
  const pageNotifiche = notificheFiltrate.slice(startNotif, startNotif + PAGE_SIZE)

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <TopBar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl p-6 mb-6 text-white shadow-lg">
          <h2 className="text-2xl font-bold tracking-tight">Benvenuto, {user.name}!</h2>
          <p className="text-emerald-100 mt-1 text-sm">I tuoi documenti fiscali sempre con te.</p>
          {nNotifiche > 0 && (
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <button onClick={() => setShowNotifPanel(!showNotifPanel)} className="bg-white text-red-600 text-sm font-bold px-3 py-1.5 rounded-full shadow flex items-center gap-1.5 hover:bg-red-50 transition-colors">
                <Bell className="h-3.5 w-3.5" />
                {nNotifiche} notifich{nNotifiche > 1 ? 'e' : 'a'} non lett{nNotifiche > 1 ? 'e' : 'a'}
              </button>
              <Button variant="secondary" size="sm" onClick={() => handleSegnaLette()}>
                <Check className="h-3.5 w-3.5 mr-1" /> Segna tutte come lette
              </Button>
            </div>
          )}
        </div>

        {showNotifPanel && (
          <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Bell className="h-4 w-4 text-emerald-600" /> Notifiche
                  {nNotifiche > 0 && <span className="text-xs text-red-600 font-semibold">· {nNotifiche} non lette 🔴</span>}
                </h3>
                <div className="flex items-center gap-2">
                  {nLette > 0 && <Button variant="outline" size="sm" onClick={handlePulisciLette}><Trash2 className="h-3 w-3 mr-1" /> Pulisci lette</Button>}
                  {notifiche.length > 0 && <Button variant="outline" size="sm" onClick={handlePulisciTutte} className="text-red-600 hover:bg-red-50"><Trash2 className="h-3 w-3 mr-1" /> Cancella tutte</Button>}
                </div>
              </div>
              <div className="flex gap-1 overflow-x-auto">
                {FILTRI.map((f) => (
                  <button key={f.id} onClick={() => setFiltroNotif(f.id)} className={cn('px-3 py-1 text-xs font-medium rounded-full transition-colors whitespace-nowrap', filtroNotif === f.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>{f.label}</button>
                ))}
              </div>
            </div>
            <div className="p-3 max-h-[400px] overflow-y-auto">
              {pageNotifiche.length === 0 ? (
                <div className="text-center py-8"><BellOff className="h-10 w-10 text-slate-300 mx-auto mb-2" /><p className="text-slate-500 font-medium text-sm">Nessuna notifica</p></div>
              ) : (
                <div className="space-y-2">
                  {pageNotifiche.map((n) => {
                    const icon = NOTIF_ICONS[n.type] ?? '🔔'
                    const style = NOTIF_STYLES[n.type] ?? DEFAULT_NOTIF_STYLE
                    const opacity = n.read ? 'opacity-50' : 'opacity-100'
                    const cardBg = n.read ? '#f8fafc' : style.bg
                    const cardBorder = n.read ? '#e2e8f0' : style.border
                    const iconBg = n.read ? '#cbd5e1' : style.iconBg
                    const textColor = n.read ? '#94a3b8' : style.text
                    const labelColor = n.read ? '#cbd5e1' : style.iconBg
                    return (
                      <div key={n.id} className={cn('relative rounded-xl border border-l-4 p-3 transition-all', opacity)} style={{ background: cardBg, borderLeftColor: cardBorder }}>
                        {!n.read && <button onClick={(e) => { e.stopPropagation(); handleSegnaLette(n.id) }} className="absolute top-2 right-2 p-1 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
                        <div className="flex items-center gap-3 cursor-pointer pr-6" onClick={() => handleNotificaClick(n)}>
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 shadow" style={{ background: iconBg }}>{icon}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5"><span className="text-[10px] font-extrabold tracking-wider" style={{ color: labelColor }}>{style.label}</span></div>
                            <p className="font-bold text-sm leading-tight" style={{ color: textColor }}>{n.text}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{formatDateAudit(n.ts)}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {totalPagesNotif > 1 && (
              <div className="px-4 py-2 border-t border-slate-200 flex items-center justify-between">
                <Button variant="outline" size="sm" disabled={pageNotif === 1} onClick={() => setPageNotif(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                <span className="text-xs text-slate-500">Pagina {pageNotif} di {totalPagesNotif}</span>
                <Button variant="outline" size="sm" disabled={pageNotif === totalPagesNotif} onClick={() => setPageNotif(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            )}
          </div>
        )}

        {avvisi.length > 0 && (
          <div className="space-y-2 mb-6">
            {avvisi.map((a) => (
              <div key={a.id} className="bg-amber-50 border border-amber-300 border-l-4 border-l-amber-500 rounded-lg p-3">
                <p className="text-xs text-amber-700 font-semibold mb-1">📢 Comunicazione dello Studio · {new Date(a.timestamp).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                <p className="text-sm text-amber-900 whitespace-pre-wrap">{a.text}</p>
              </div>
            ))}
          </div>
        )}

        <div className="border-b border-slate-200 mb-6">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Tabs">
            {TABS.map((t) => {
              const Icon = t.icon
              const active = clienteTab === t.id
              const badge = t.id === 'messaggi' && nMsgNonLetti > 0 ? nMsgNonLetti : 0
              return (
                <button key={t.id} onClick={() => setClienteTab(t.id)} className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap relative', active ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300')}>
                  <Icon className="h-4 w-4" />{t.label}
                  {badge > 0 && <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center">{badge}</span>}
                </button>
              )
            })}
          </nav>
        </div>

        {clienteTab === 'archivio' && <ClienteArchivio />}
        {clienteTab === 'cassetto' && <ClienteCassetto />}
        {clienteTab === 'messaggi' && <ClienteMessaggi />}
        {clienteTab === 'avvisi' && <ClienteAvvisi />}
        {clienteTab === 'attivita' && <ClienteAttivita />}
      </main>
    </div>
  )
}
