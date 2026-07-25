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
      toast.success(nuovo ? 'Modalita manutenzione attivata' : 'Modalita produzione riattivata')
    } catch {
      toast.error('Errore')
    }
  }

  const initials = getInitials(user.name)
  const roleLabel = user.role === 'admin' ? 'Admin' : 'Cliente'

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200 h-14 flex items-center justify-between px-3 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center text-white font-extrabold text-sm sm:text-base shadow">P</div>
        <div className="hidden sm:block">
          <h1 className="text-sm font-bold text-slate-900 leading-tight tracking-tight">Portale Documenti Clienti</h1>
          <p className="text-[10px] text-slate-500 leading-tight">Studio PFC</p>
        </div>
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        {user.role === 'admin' && (
          <Button variant={maintenance ? 'default' : 'outline'} size="sm" onClick={toggleMaintenance} className={maintenance ? 'bg-amber-600 hover:bg-amber-700 text-white h-8 px-2 text-xs' : 'border-amber-300 text-amber-700 hover:bg-amber-50 h-8 px-2 text-xs'}>
            <Wrench className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">{maintenance ? 'Manutenzione ON' : 'Manutenzione'}</span>
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger>
            <div className="flex items-center gap-1.5 sm:gap-2 px-1.5 sm:px-2 py-1 rounded-md hover:bg-slate-100 cursor-pointer">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 border-2 border-blue-300 flex items-center justify-center text-[10px] sm:text-xs font-bold text-blue-700">{initials}</div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-semibold text-slate-900 leading-tight">{user.name}</div>
                <div className="text-[10px] text-slate-500 leading-tight flex items-center gap-1">{user.role === 'admin' ? <Shield className="h-2.5 w-2.5" /> : <UserIcon className="h-2.5 w-2.5" />}{roleLabel}</div>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5 sm:hidden">
              <p className="text-sm font-semibold text-slate-900">{user.name}</p>
              <p className="text-xs text-slate-500">@{user.username}</p>
            </div>
            <DropdownMenuSeparator className="sm:hidden" />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer">
              <LogOut className="h-4 w-4 mr-2" /> Esci
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
