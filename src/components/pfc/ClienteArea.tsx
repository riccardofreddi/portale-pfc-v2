'use client'

import { useEffect, useState } from 'react'
import { usePfcStore } from '@/store/pfc'
import { TopBar } from './TopBar'
import { ClienteArchivio } from './cliente/ClienteArchivio'
import { ClienteMessaggi } from './cliente/ClienteMessaggi'
import { ClienteAvvisi } from './cliente/ClienteAvvisi'
import { ClienteCassetto } from './cliente/ClienteCassetto'
import { ClienteAttivita } from './cliente/ClienteAttivita'
import { FolderOpen, MessageSquare, Megaphone, Bell, Briefcase, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

const TABS = [
  { id: 'archivio', label: 'Archivio Documenti', icon: FolderOpen },
  { id: 'cassetto', label: 'Cassetto Digitale', icon: Briefcase },
  { id: 'messaggi', label: 'Messaggi', icon: MessageSquare },
  { id: 'avvisi', label: 'Avvisi', icon: Megaphone },
  { id: 'attivita', label: 'Le mie attività', icon: ClipboardList },
] as const

export function ClienteArea() {
  const { user, clienteTab, setClienteTab } = usePfcStore()
  const [nNotifiche, setNNotifiche] = useState(0)
  const [nMsgNonLetti, setNMsgNonLetti] = useState(0)
  const [avvisi, setAvvisi] = useState<Array<{ id: string; text: string; timestamp: string }>>([])

  useEffect(() => {
    if (!user) return
    Promise.all([
      api.notifiche.list().catch(() => ({ notifiche: [] })),
      api.messaggi.list(user.username).catch(() => ({ messaggi: [] })),
      api.avvisi.list().catch(() => ({ avvisi: [] })),
    ]).then(([n, m, a]) => {
      setNNotifiche((n.notifiche as unknown as Array<{ read: boolean }>).filter((x) => !x.read).length)
      setNMsgNonLetti((m.messaggi as unknown as Array<{ read: boolean }>).filter((x) => !x.read).length)
      setAvvisi(a.avvisi)
    })
  }, [user, clienteTab])

  async function handleSegnaLette() {
    try {
      await api.notifiche.segnaLette()
      setNNotifiche(0)
      toast.success('Notifiche segnate come lette')
    } catch {
      toast.error('Errore')
    }
  }

  if (!user) return null

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <TopBar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Welcome banner */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-2xl p-6 mb-6 text-white shadow-lg">
          <h2 className="text-2xl font-bold tracking-tight">Benvenuto, {user.name}!</h2>
          <p className="text-emerald-100 mt-1 text-sm">I tuoi documenti fiscali sempre con te.</p>
          {nNotifiche > 0 && (
            <div className="mt-3 flex items-center gap-3">
              <span className="bg-white text-red-600 text-sm font-bold px-3 py-1 rounded-full shadow flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5" />
                {nNotifiche} notifich{nNotifiche > 1 ? 'e' : 'a'} non lett{nNotifiche > 1 ? 'e' : 'a'}
              </span>
              <Button variant="secondary" size="sm" onClick={handleSegnaLette}>
                Segna come lette
              </Button>
            </div>
          )}
        </div>

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
