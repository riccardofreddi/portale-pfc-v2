'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { api } from '@/lib/api-client'
import { usePfcStore } from '@/store/pfc'
import { getInitials } from '@/lib/pfc-utils'
import { toast } from 'sonner'
import { LogOut, Wrench, Shield, User as UserIcon, ChevronDown } from 'lucide-react'

export function TopBar() {
  const { user, setUser } = usePfcStore()
  const [maintenance, setMaintenance] = useState(false)

  useEffect(() => {
    if (user?.role === 'admin') {
      api.sistema.manutenzione.get().then((r) => setMaintenance(r.attivo)).catch(() => {})
    }
  }, [user?.role])

  if (!user) return null

  async function handleLogout() {
    try {
      await api.auth.logout()
      setUser(null)
      toast.success('Disconnessione eseguita')
    } catch {
      toast.error('Errore durante il logout')
    }
  }

  async function toggleMaintenance() {
    try {
      const nuovo = !maintenance
      const r = await api.sistema.manutenzione.toggle(nuovo)
      setMaintenance(r.attivo)
      toast.success(nuovo ? 'Modalita manutenzione attivata - clienti bloccati' : 'Modalita produzione riattivata')
    } catch {
      toast.error('Errore cambio modalita')
    }
  }

  const initials = getInitials(user.name)
  const roleLabel = user.role === 'admin' ? 'Amministratore' : 'Cliente'

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center text-white font-extrabold text-base shadow">P</div>
          <div className="hidden sm:block">
            <h1 className="text-base font-bold text-slate-900 leading-tight tracking-tight">Portale Documenti Clienti</h1>
            <p className="text-[11px] text-slate-500 leading-tight">Studio PFC</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user.role === 'admin' && (
            <Button variant={maintenance ? 'default' : 'outline'} size="sm" onClick={toggleMaintenance} className={maintenance ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'border-amber-300 text-amber-700 hover:bg-amber-50'}>
              <Wrench className="h-4 w-4 mr-1.5" />{maintenance ? 'Manutenzione ON' : 'Manutenzione'}
            </Button>
          )}
          {maintenance && user.role === 'admin' && (
            <Badge variant="outline" className="hidden md:inline-flex border-amber-400 bg-amber-50 text-amber-800">Clienti bloccati</Badge>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-100 cursor-pointer">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 border-2 border-blue-300 flex items-center justify-center text-xs font-bold text-blue-700">{initials}</div>
                <div className="hidden sm:block text-left">
                  <div className="text-sm font-semibold text-slate-900 leading-tight">{user.name}</div>
                  <div className="text-[11px] text-slate-500 leading-tight flex items-center gap-1">{user.role === 'admin' ? <Shield className="h-3 w-3" /> : <UserIcon className="h-3 w-3" />}{roleLabel}</div>
                </div>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500">@{user.username}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer">
                <LogOut className="h-4 w-4 mr-2" /> Esci
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
