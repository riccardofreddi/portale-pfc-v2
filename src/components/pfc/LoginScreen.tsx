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
        toast.error(res.error ?? 'Credenziali non valide')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore di login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-slate-100 p-4">
      <div className="w-full max-w-md w-full px-4">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center text-white font-extrabold text-2xl shadow-lg mb-4">P</div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Portale Documenti Clienti</h1>
          
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
