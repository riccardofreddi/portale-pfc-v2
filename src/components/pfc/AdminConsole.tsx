'use client'

import { usePfcStore } from '@/store/pfc'
import { TopBar } from './TopBar'
import { TabInvioDocumenti } from './admin/TabInvioDocumenti'
import { TabGestioneClienti } from './admin/TabGestioneClienti'
import { TabBacheca } from './admin/TabBacheca'
import { TabCestino } from './admin/TabCestino'
import { TabResoconto } from './admin/TabResoconto'
import { Upload, Users, MessageSquare, Archive, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'invio', label: 'Invio Documenti', icon: Upload },
  { id: 'clienti', label: 'Gestione Clienti', icon: Users },
  { id: 'bacheca', label: 'Bacheca e Messaggi', icon: MessageSquare },
  { id: 'cestino', label: 'Cestino', icon: Archive },
  { id: 'resoconto', label: 'Resoconto Archivio', icon: BarChart3 },
] as const

export function AdminConsole() {
  const { adminTab, setAdminTab } = usePfcStore()
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <TopBar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6 flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <p className="font-mono text-[10.5px] tracking-widest uppercase text-muted-foreground mb-1">Studio PFC &middot; Area riservata</p>
            <h2 className="font-display font-semibold text-[26px] text-foreground tracking-tight">Console di Amministrazione</h2>
            <p className="text-sm text-muted-foreground mt-1">Gestisci clienti, documenti, comunicazioni e monitora lo stato del sistema.</p>
          </div>
        </div>
        <div className="border-b border-border mb-6">
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Tabs">
            {TABS.map((t) => {
              const Icon = t.icon
              const active = adminTab === t.id
              return (
                <button key={t.id} onClick={() => setAdminTab(t.id)} className={cn('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap', active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-slate-300')}>
                  <Icon className="h-4 w-4" />{t.label}
                </button>
              )
            })}
          </nav>
        </div>
        {adminTab === 'invio' && <TabInvioDocumenti />}
        {adminTab === 'clienti' && <TabGestioneClienti />}
        {adminTab === 'bacheca' && <TabBacheca />}
        {adminTab === 'cestino' && <TabCestino />}
        {adminTab === 'resoconto' && <TabResoconto />}
      </main>
    </div>
  )
}
