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
    <header className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="pfc-mark w-9 h-9 rounded-md bg-emerald-800 text-emerald-50 flex items-center justify-center text-[10px]">PFC</div>
          <div className="hidden sm:block">
            <h1 className="font-display font-semibold text-[15px] text-foreground leading-tight tracking-tight">Portale Documenti Clienti</h1>
            <p className="text-[11px] font-mono text-muted-foreground leading-tight tracking-wide">Studio PFC</p>
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
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer">
                <div className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-xs font-mono font-semibold text-emerald-800">{initials}</div>
                <div className="hidden sm:block text-left">
                  <div className="text-sm font-semibold text-foreground leading-tight">{user.name}</div>
                  <div className="text-[11px] text-muted-foreground leading-tight flex items-center gap-1">{user.role === 'admin' ? <Shield className="h-3 w-3" /> : <UserIcon className="h-3 w-3" />}{roleLabel}</div>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-semibold text-foreground">{user.name}</p>
                <p className="text-xs text-muted-foreground font-mono">@{user.username}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-700 focus:text-red-800 focus:bg-red-50 cursor-pointer">
                <LogOut className="h-4 w-4 mr-2" /> Esci
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
