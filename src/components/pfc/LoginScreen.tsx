'use client'

import { useState, type FormEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api-client'
import { usePfcStore } from '@/store/pfc'
import { toast } from 'sonner'
import { Loader2, LogIn, User, Lock } from 'lucide-react'

export function LoginScreen() {
  const { setUser } = usePfcStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [maintenance, setMaintenance] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!username || !password) {
      toast.error('Inserisci username e password')
      return
    }
    setLoading(true)
    try {
      const res = await api.auth.login(username, password)
      if (res.ok) {
        toast.success('Accesso eseguito')
        const me = await api.auth.me()
        setUser(me.user)
      } else {
        // Se l'errore contiene "manutenzione", mostra la schermata di manutenzione
        if (res.error?.toLowerCase().includes('manutenzione')) {
          setMaintenance(true)
        } else {
          toast.error(res.error ?? 'Credenziali non valide')
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Errore di login'
      if (errorMsg.toLowerCase().includes('manutenzione')) {
        setMaintenance(true)
      } else {
        toast.error(errorMsg)
      }
    } finally {
      setLoading(false)
    }
  }

  // Schermata manutenzione a tutto schermo
  if (maintenance) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
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
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center text-white font-extrabold text-2xl shadow-lg mb-4">P</div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Portale Documenti Clienti</h1>
          <p className="text-sm text-slate-500 mt-2">Accedi con le tue credenziali</p>
        </div>
        <Card className="shadow-xl border-slate-200">
          <CardHeader><CardTitle className="text-center text-lg">Accesso al Portale</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-medium text-slate-700">Username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input id="username" type="text" autoComplete="username" placeholder="Il tuo username" value={username} onChange={(e) => setUsername(e.target.value)} className="pl-9" disabled={loading} autoFocus />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-slate-700">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input id="password" type="password" autoComplete="current-password" placeholder="La tua password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9" disabled={loading} />
                </div>
              </div>
              <Button type="submit" disabled={loading || !username || !password} className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-semibold">
                {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Accesso in corso...</> : <><LogIn className="h-4 w-4 mr-2" /> Accedi</>}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
