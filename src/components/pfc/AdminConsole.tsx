'use client'

import { usePfcStore } from '@/store/pfc'
import { TopBar } from './TopBar'
import { TabInvioDocumenti } from './admin/TabInvioDocumenti'
import { TabGestioneClienti } from './admin/TabGestioneClienti'
import { TabBacheca } from './admin/TabBacheca'
import { TabCestino } from './admin/TabCestino'
import { TabRisposte } from './admin/TabRisposte'
import { TabResoconto } from './admin/TabResoconto'
import { Upload, Users, MessageSquare, Archive, BarChart3, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'invio', label: 'Invio Documenti', icon: Upload },
  { id: 'clienti', label: 'Gestione Clienti', icon: Users },
  { id: 'bacheca', label: 'Bacheca e Messaggi', icon: MessageSquare },
  { id: 'cestino', label: 'Cestino', icon: Archive },
  { id: 'risposte', label: 'File Ricevuti', icon: Inbox },
  { id: 'resoconto', label: 'Resoconto Archivio', icon: BarChart3 },
] as const

export function AdminConsole() {
  const { adminTab, setAdminTab } = usePfcStore()
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <TopBar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
        {/* Header */}
        <div className="mb-5 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Console di Amministrazione</h2>
          <p className="text-sm text-slate-500 mt-1">Gestisci clienti, documenti, comunicazioni e monitora lo stato del sistema.</p>
        </div>

        {/* Tabs - scrollable su mobile */}
        <div className="border-b-2 border-slate-200 mb-5 sm:mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto scrollbar-hide">
          <nav className="flex gap-1 min-w-max" aria-label="Tabs">
            {TABS.map((t) => {
              const Icon = t.icon
              const active = adminTab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setAdminTab(t.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-3 sm:px-4 sm:py-3.5 text-xs sm:text-sm font-semibold border-b-[3px] transition-all whitespace-nowrap flex-shrink-0',
                    active
                      ? 'border-emerald-500 text-emerald-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span>{t.label}</span>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Content */}
        {adminTab === 'invio' && <TabInvioDocumenti />}
        {adminTab === 'clienti' && <TabGestioneClienti />}
        {adminTab === 'bacheca' && <TabBacheca />}
        {adminTab === 'cestino' && <TabCestino />}
        {adminTab === 'risposte' && <TabRisposte />}
        {adminTab === 'resoconto' && <TabResoconto />}
      </main>
    </div>
  )
}
