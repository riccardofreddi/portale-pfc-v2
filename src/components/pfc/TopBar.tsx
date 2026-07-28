'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api-client'
import { usePfcStore } from '@/store/pfc'
import { getInitials } from '@/lib/pfc-utils'
import { toast } from 'sonner'
import { LogOut, Wrench, Shield, User as UserIcon, Bell, ChevronDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

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
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 h-[60px] flex items-center justify-between px-3 sm:px-6 lg:px-8 shadow-sm">
      {/* Left: Logo */}
      <div className="flex items-center gap-2.5 sm:gap-3 flex-shrink-0">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-[10px] bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white font-extrabold text-sm sm:text-base shadow-[0_2px_8px_rgba(16,185,129,0.3)] flex-shrink-0">
          PF
        </div>
        <div className="hidden sm:block">
          <h1 className="text-sm font-bold text-slate-800 leading-tight tracking-tight">Portale Documenti</h1>
          <p className="text-[11px] text-slate-500 leading-tight">Area Clienti</p>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Maintenance (Admin only) */}
        {user.role === 'admin' && (
          <button
            onClick={toggleMaintenance}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-[10px] text-xs font-semibold transition-all flex-shrink-0 ${
              maintenance
                ? 'bg-amber-500 text-white border border-amber-500 shadow-sm'
                : 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100'
            }`}
          >
            <Wrench className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="hidden sm:inline">{maintenance ? 'Manutenzione ON' : 'Manutenzione'}</span>
          </button>
        )}

        {/* Notifications bell (placeholder, il contenuto viene gestito da ClienteArea/AdminConsole) */}
        {/* Questo è solo visivo nella TopBar, le notifiche vere sono nel pannello sotto */}

        {/* User Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-1.5 sm:px-2.5 py-1.5 rounded-xl hover:bg-slate-100 transition-all border-1.5 border-transparent hover:border-slate-200 flex-shrink-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 border-2 border-blue-400 flex items-center justify-center text-[11px] sm:text-xs font-bold text-blue-700 flex-shrink-0">
                {initials}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-semibold text-slate-800 leading-tight">{user.name}</div>
                <div className="text-[10px] text-slate-500 leading-tight flex items-center gap-1">
                  {user.role === 'admin' ? <Shield className="h-2.5 w-2.5" /> : <UserIcon className="h-2.5 w-2.5" />}
                  {roleLabel}
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-400 hidden sm:block flex-shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5 sm:hidden">
              <p className="text-sm font-semibold text-slate-900">{user.name}</p>
              <p className="text-xs text-slate-500">{roleLabel}</p>
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
