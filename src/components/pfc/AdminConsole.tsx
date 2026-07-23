'use client'

import { usePfcStore } from '@/store/pfc'
import { TopBar } from './TopBar'
import { TabInvioDocumenti } from './admin/TabInvioDocumenti'
import { TabGestioneClienti } from './admin/TabGestioneClienti'
import { TabBacheca } from './admin/TabBacheca'
import { TabResoconto } from './admin/TabResoconto'
import { Upload, Users, MessageSquare, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'invio', label: 'Invio Documenti', icon: Upload },
  { id: 'clienti', label: 'Gestione Clienti', icon: Users },
  { id: 'bacheca', label: 'Bacheca e Messaggi', icon: MessageSquare },
  { id: 'resoconto', label: 'Resoconto Archivio', icon: BarChart3 },
] as const

export function AdminConsole() {
  const { adminTab, setAdminTab } = usePfcStore()
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <TopBar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Console di Amministrazione</h2>
          <p className="text-sm text-slate-500 mt-1">Gestisci clienti, documenti, comunicazioni e monitora lo stato del sistema.</p>
        </div>
        <div className="border-b border-slate-200 mb-6">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Tabs">
            {TABS.map((t) => {
              const Icon = t.icon
              const active = adminTab === t.id
              return (
                <button key={t.id} onClick={() => setAdminTab(t.id)} className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap', active ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300')}>
                  <Icon className="h-4 w-4" />{t.label}
                </button>
              )
            })}
          </nav>
        </div>
        {adminTab === 'invio' && <TabInvioDocumenti />}
        {adminTab === 'clienti' && <TabGestioneClienti />}
        {adminTab === 'bacheca' && <TabBacheca />}
        {adminTab === 'resoconto' && <TabResoconto />}
      </main>
    </div>
  )
}
