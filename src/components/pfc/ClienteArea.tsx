'use client'

import { useEffect, useState } from 'react'
import { usePfcStore } from '@/store/pfc'
import { TopBar } from './TopBar'
import { ClienteArchivio } from './cliente/ClienteArchivio'
import { ClienteMessaggi } from './cliente/ClienteMessaggi'
import { ClienteAvvisi } from './cliente/ClienteAvvisi'
import { ClienteCassetto } from './cliente/ClienteCassetto'
import { ClienteAttivita } from './cliente/ClienteAttivita'
import { FolderOpen, MessageSquare, Megaphone, Bell, Briefcase, ClipboardList, ChevronDown, ChevronRight, Check, Trash2, BellOff, BellRing } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { formatDateAudit } from '@/lib/pfc-utils'
import { useNotificationBadge } from '@/hooks/useNotificationBadge'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { restoreFavicon } from '@/lib/favicon-badge'

interface Notifica {
  id: string
  type: string
  text: string
  detail: string
  ts: string
  read: boolean
  year?: string | null
  folder?: string | null
}

const NOTIF_ICONS: Record<string, string> = {
  documento_nuovo: '📄',
  messaggio: '💬',
  avviso: '📢',
  richiesta_upload: '📤',
  upload_confermato: '✅',
}

const NOTIF_COLORS: Record<string, { gradient: string; border: string; iconBg: string; text: string; label: string }> = {
  documento_nuovo: { gradient: 'linear-gradient(135deg,#dbeafe,#eff6ff)', border: '#3b82f6', iconBg: '#3b82f6', text: '#1e40af', label: 'DOCUMENTO' },
  messaggio: { gradient: 'linear-gradient(135deg,#dcfce7,#f0fdf4)', border: '#16a34a', iconBg: '#16a34a', text: '#15803d', label: 'MESSAGGIO' },
  avviso: { gradient: 'linear-gradient(135deg,#fef3c7,#fffbeb)', border: '#f59e0b', iconBg: '#f59e0b', text: '#92400e', label: 'AVVISO' },
  richiesta_upload: { gradient: 'linear-gradient(135deg,#fce7f3,#fdf2f8)', border: '#ec4899', iconBg: '#ec4899', text: '#9f1239', label: 'RICHIESTA' },
  upload_confermato: { gradient: 'linear-gradient(135deg,#ede9fe,#f5f3ff)', border: '#8b5cf6', iconBg: '#8b5cf6', text: '#6d28d9', label: 'RICEVUTO' },
}

const DEFAULT_NOTIF_COLOR = { gradient: '#f8fafc', border: '#94a3b8', iconBg: '#94a3b8', text: '#475569', label: 'NOTIFICA' }

const TABS = [
  { id: 'archivio', label: 'Archivio Documenti', icon: FolderOpen },
  { id: 'cassetto', label: 'Cassetto Digitale', icon: Briefcase },
  { id: 'messaggi', label: 'Messaggi', icon: MessageSquare },
  { id: 'avvisi', label: 'Avvisi', icon: Megaphone },
  { id: 'attivita', label: 'Le mie attività', icon: ClipboardList },
] as const

export function ClienteArea() {
  const { user, clienteTab, setClienteTab, setAnno, setCartella, nNotifiche, setNNotifiche, showNotifPanel, setShowNotifPanel } = usePfcStore()
  const [notifiche, setNotifiche] = useState<Notifica[]>([])
  const [nMsgNonLetti, setNMsgNonLetti] = useState(0)
  const [avvisi, setAvvisi] = useState<Array<{ id: string; text: string; timestamp: string }>>([])

  // Badge numerico su icona app + suono in-app per nuove notifiche
  useNotificationBadge(!!user)

  // Web Push Notifications — solo per clienti, solo se supportato
  const push = usePushNotifications(user?.role === 'client')

  async function handlePushToggle() {
    try {
      if (push.subscribed) {
        await push.unsubscribe()
        toast.success('Notifiche push disattivate')
      } else {
        await push.subscribe()
        toast.success('Notifiche push attivate! 🎉')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Errore attivazione notifiche'
      toast.error(msg)
    }
  }

  async function handlePushTest() {
    try {
      const res = await push.test()
      if (res.ok) {
        toast.success('Notifica di test inviata! Controlla il dispositivo.')
      } else {
        toast.error(res.msg ?? 'Nessuna sottoscrizione attiva')
      }
    } catch {
      toast.error('Errore invio test')
    }
  }

  async function loadNotifiche() {
    if (!user) return
    try {
      const [n, m, a] = await Promise.all([
        api.notifiche.list(),
        api.messaggi.list(user.username).catch(() => ({ messaggi: [] })),
        api.avvisi.list().catch(() => ({ avvisi: [] })),
      ])
      const notifs = (n.notifiche as unknown as Notifica[])
      setNotifiche(notifs)
      setNNotifiche(notifs.filter((x) => !x.read).length)
      setNMsgNonLetti((m.messaggi as unknown as Array<{ read: boolean }>).filter((x) => !x.read).length)
      setAvvisi(a.avvisi)
    } catch {}
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadNotifiche()
  }, [user, clienteTab])

  async function handleSegnaLette() {
    try {
      await api.notifiche.segnaLette()
      setNNotifiche(0)
      setNotifiche((curr) => curr.map((n) => ({ ...n, read: true })))
      clearAppBadge()
      toast.success('Notifiche segnate come lette')
    } catch { toast.error('Errore') }
  }

  async function handlePulisciLette() {
    try {
      await api.notifiche.pulisciLette()
      setNotifiche((curr) => curr.filter((n) => !n.read))
      toast.success('Notifiche lette pulite')
    } catch { toast.error('Errore') }
  }

  async function handlePulisciTutte() {
    try {
      await api.notifiche.pulisciTutte()
      setNotifiche([])
      setNNotifiche(0)
      clearAppBadge()
      toast.success('Tutte le notifiche cancellate')
    } catch { toast.error('Errore') }
  }

  function handleNotificaClick(n: Notifica) {
    if (n.type === 'documento_nuovo' && n.year && n.folder) {
      setAnno(n.year)
      setCartella(n.folder)
      setClienteTab('archivio')
    } else if (n.type === 'messaggio' || n.type === 'richiesta_upload') {
      setClienteTab('messaggi')
    } else if (n.type === 'avviso') {
      setClienteTab('avvisi')
    }
    setShowNotifPanel(false)
  }

  if (!user) return null

  const nLette = notifiche.filter((n) => n.read).length

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <TopBar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Welcome banner */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl p-6 mb-6 text-white shadow-lg">
          <h2 className="text-2xl font-bold tracking-tight">Benvenuto, {user.name}!</h2>
          <p className="text-emerald-100 mt-1 text-sm">I tuoi documenti fiscali sempre con te.</p>
          {nNotifiche > 0 && (
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <button
                onClick={() => setShowNotifPanel(!showNotifPanel)}
                className="bg-white text-red-600 text-sm font-bold px-3 py-1.5 rounded-full shadow flex items-center gap-1.5 hover:bg-red-50 transition-colors"
              >
                <Bell className="h-3.5 w-3.5" />
                {nNotifiche} notifich{nNotifiche > 1 ? 'e' : 'a'} non lett{nNotifiche > 1 ? 'e' : 'a'}
                {showNotifPanel ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              <Button variant="secondary" size="sm" onClick={handleSegnaLette}>
                <Check className="h-3.5 w-3.5 mr-1" /> Segna come lette
              </Button>
            </div>
          )}
          {push.supported && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <button
                onClick={handlePushToggle}
                disabled={push.loading}
                className={cn(
                  'text-xs font-semibold px-3 py-1.5 rounded-full shadow flex items-center gap-1.5 transition-colors disabled:opacity-60',
                  push.subscribed
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    : 'bg-white/15 text-white hover:bg-white/25 border border-white/30'
                )}
              >
                <BellRing className="h-3.5 w-3.5" />
                {push.subscribed ? 'Notifiche attive' : 'Attiva notifiche push'}
              </button>
              {push.subscribed && (
                <button
                  onClick={handlePushTest}
                  className="text-xs font-medium px-2.5 py-1.5 rounded-full text-emerald-100 hover:text-white hover:bg-white/15 transition-colors"
                >
                  Invia test
                </button>
              )}
            </div>
          )}
        </div>

        {/* Pannello notifiche espandibile */}
        {showNotifPanel && (
          <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Bell className="h-4 w-4 text-emerald-600" />
                Notifiche
                {nNotifiche > 0 && <span className="text-xs text-red-600 font-semibold">· {nNotifiche} non lette 🔴</span>}
              </h3>
              <div className="flex items-center gap-2">
                {nLette > 0 && (
                  <Button variant="outline" size="sm" onClick={handlePulisciLette}>
                    <Trash2 className="h-3 w-3 mr-1" /> Pulisci lette
                  </Button>
                )}
                {notifiche.length > 0 && (
                  <Button variant="outline" size="sm" onClick={handlePulisciTutte} className="text-red-600 hover:bg-red-50">
                    <Trash2 className="h-3 w-3 mr-1" /> Cancella tutte
                  </Button>
                )}
              </div>
            </div>

            <div className="p-3 max-h-96 overflow-y-auto">
              {notifiche.length === 0 ? (
                <div className="text-center py-8">
                  <BellOff className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500 font-medium text-sm">Nessuna notifica</p>
                  <p className="text-xs text-slate-400 mt-1">Le tue notifiche appariranno qui</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {notifiche.slice(0, 20).map((n) => {
                    const icon = NOTIF_ICONS[n.type] ?? '🔔'
                    const color = NOTIF_COLORS[n.type] ?? DEFAULT_NOTIF_COLOR
                    const opacity = n.read ? 'opacity-50' : 'opacity-100'
                    const cardBg = n.read ? '#f8fafc' : color.gradient
                    const cardBorder = n.read ? '#e2e8f0' : color.border
                    const iconBg = n.read ? '#cbd5e1' : color.iconBg
                    const textColor = n.read ? '#94a3b8' : color.text
                    const labelColor = n.read ? '#cbd5e1' : color.iconBg

                    return (
                      <div
                        key={n.id}
                        className={`rounded-xl border border-l-4 p-3 transition-all cursor-pointer hover:shadow-md ${opacity}`}
                        style={{ background: cardBg, borderLeftColor: cardBorder }}
                        onClick={() => handleNotificaClick(n)}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 shadow"
                            style={{ background: iconBg }}
                          >
                            {icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[10px] font-extrabold tracking-wider" style={{ color: labelColor }}>
                                {color.label}
                              </span>
                              {n.read && (
                                <span className="text-[9px] font-bold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">
                                  LETTA
                                </span>
                              )}
                            </div>
                            <p className="font-bold text-sm leading-tight" style={{ color: textColor }}>
                              {n.text}
                            </p>
                            {n.detail && (
                              <p className="text-xs text-slate-400 mt-1 truncate">📎 {n.detail}</p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="text-[10px] text-slate-400 whitespace-nowrap">
                              {formatDateAudit(n.ts)}
                            </span>
                          </div>
                        </div>
                        {n.type === 'documento_nuovo' && n.year && n.folder && (
                          <div className="mt-2 ml-13">
                            <span className="text-xs text-blue-600 font-medium">📂 Vai alla cartella {n.folder} →</span>
                          </div>
                        )}
                        {(n.type === 'messaggio' || n.type === 'richiesta_upload') && (
                          <div className="mt-2">
                            <span className="text-xs text-emerald-600 font-medium">💬 Vai al messaggio →</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {notifiche.length > 20 && (
                    <p className="text-center text-xs text-slate-400 pt-2">
                      ... e altre {notifiche.length - 20} notifiche precedenti
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Avvisi attivi */}
        {avvisi.length > 0 && (
          <div className="space-y-2 mb-6">
            {avvisi.map((a) => (
              <div key={a.id} className="bg-amber-50 border border-amber-300 border-l-4 border-l-amber-500 rounded-lg p-3">
                <p className="text-xs text-amber-700 font-semibold mb-1">
                  📢 Comunicazione dello Studio · {new Date(a.timestamp).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <p className="text-sm text-amber-900 whitespace-pre-wrap">{a.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tab navigation */}
        <div className="border-b border-slate-200 mb-6">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Tabs">
            {TABS.map((t) => {
              const Icon = t.icon
              const active = clienteTab === t.id
              const badge = t.id === 'messaggi' && nMsgNonLetti > 0 ? nMsgNonLetti : 0
              return (
                <button
                  key={t.id}
                  onClick={() => setClienteTab(t.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap relative',
                    active
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                  {badge > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center">
                      {badge}
                    </span>
                  )}
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

function clearAppBadge() {
  try {
    if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) {
      ;(navigator as Navigator & {
        clearAppBadge: () => Promise<void>
      }).clearAppBadge().catch(() => {})
    }
    navigator.serviceWorker?.ready.then((reg) => {
      reg.active?.postMessage({ type: 'CLEAR_BADGE' })
    }).catch(() => {})
    // Ripristina la favicon originale quando non ci sono più notifiche non lette
    restoreFavicon()
  } catch {}
}
