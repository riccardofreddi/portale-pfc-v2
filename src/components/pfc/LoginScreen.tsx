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
    <div className="min-h-screen flex items-center justify-center bg-background pfc-rule-bg p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="pfc-mark w-14 h-14 rounded-lg bg-emerald-800 text-emerald-50 flex items-center justify-center text-base mb-5">PFC</div>
          <p className="font-mono text-[11px] tracking-widest uppercase text-muted-foreground mb-1.5">Studio PFC &middot; Accesso riservato</p>
          <h1 className="font-display font-semibold text-[28px] text-foreground tracking-tight text-center leading-snug">
            Portale Documenti Clienti
          </h1>
        </div>
        <Card className="border-border shadow-sm">
          <CardHeader className="border-b border-border pb-4">
            <CardTitle className="text-center text-base font-semibold text-foreground">Accesso al portale</CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-medium text-secondary-foreground">Username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="username" type="text" autoComplete="username" placeholder="Il tuo username" value={username} onChange={(e) => setUsername(e.target.value)} className="pl-9" disabled={loading} autoFocus />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-secondary-foreground">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="password" type="password" autoComplete="current-password" placeholder="La tua password" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9" disabled={loading} />
                </div>
              </div>
              <Button type="submit" disabled={loading || !username || !password} className="w-full font-semibold">
                {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Accesso in corso…</> : <><LogIn className="h-4 w-4 mr-2" /> Accedi</>}
              </Button>
              <p className="text-xs text-center text-muted-foreground mt-4">
                Admin di default: <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">admin</code> / <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px]">admin</code>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
