'use client'

import { useState, type FormEvent } from 'react'
import { api } from '@/lib/api-client'
import { usePfcStore } from '@/store/pfc'
import { toast } from 'sonner'
import { Loader2, Eye, EyeOff } from 'lucide-react'

export function LoginScreen() {
  const { setUser } = usePfcStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 relative overflow-hidden">
      {/* Particelle di sfondo */}
      <div className="absolute top-[-80px] left-[-80px] w-[250px] h-[250px] rounded-full bg-emerald-500/15 blur-[60px] animate-pulse"></div>
      <div className="absolute bottom-[-100px] right-[-100px] w-[300px] h-[300px] rounded-full bg-emerald-500/15 blur-[60px] animate-pulse" style={{ animationDelay: '3s' }}></div>
      <div className="absolute top-[40%] left-1/2 w-[150px] h-[150px] rounded-full bg-blue-500/10 blur-[60px] animate-pulse" style={{ animationDelay: '6s' }}></div>

      {/* Card Login */}
      <div className="relative z-10 w-full max-w-[380px] bg-white/97 backdrop-blur-xl rounded-[28px] shadow-[0_20px_50px_rgba(0,0,0,0.25)] p-9 sm:p-10 animate-[cardEnter_0.6s_cubic-bezier(0.16,1,0.3,1)]">
        <style>{`
          @keyframes cardEnter {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* Logo */}
        <div className="text-center mb-7">
          <div className="w-16 h-16 mx-auto mb-3.5 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center text-white font-extrabold text-[26px] tracking-tight shadow-[0_6px_20px_rgba(16,185,129,0.35)]">
            PF
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Portale Documenti</h1>
          <p className="text-[13px] text-slate-500 mt-0.5">Accesso riservato ai clienti</p>
        </div>

        {/* Badge informativo */}
        <div className="text-center mb-6">
          <p className="text-[13px] font-semibold text-emerald-700">I tuoi documenti fiscali, sempre con te.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-[18px]">
          {/* Username */}
          <div className="space-y-[7px]">
            <label className="block text-[13px] font-semibold text-slate-600">Username</label>
            <input
              type="text"
              autoComplete="username"
              placeholder="Inserisci il tuo username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoFocus
              className="w-full px-4 py-[15px] text-base border-2 border-slate-200 rounded-[14px] bg-slate-50 text-slate-800 outline-none transition-all duration-200 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 placeholder:text-slate-300"
            />
          </div>

          {/* Password con toggle occhio */}
          <div className="space-y-[7px]">
            <label className="block text-[13px] font-semibold text-slate-600">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Inserisci la tua password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-[15px] pr-12 text-base border-2 border-slate-200 rounded-[14px] bg-slate-50 text-slate-800 outline-none transition-all duration-200 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 placeholder:text-slate-300"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-emerald-600 transition-colors p-1"
                tabIndex={-1}
                aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Pulsante Accedi */}
          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full py-4 text-base font-bold text-white bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-[14px] shadow-[0_4px_12px_rgba(16,185,129,0.3)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(16,185,129,0.4)] active:scale-95 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_12px_rgba(16,185,129,0.3)] mt-1.5"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" /> Accesso in corso...
              </span>
            ) : (
              'Accedi al Portale'
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="text-center mt-7 pt-5 border-t border-slate-200">
          <p className="text-xs text-slate-400">Portale sicuro e riservato · Tutti i diritti riservati</p>
        </div>
      </div>
    </div>
  )
}
