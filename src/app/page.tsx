'use client'

import { useEffect } from 'react'
import { usePfcStore } from '@/store/pfc'
import { api } from '@/lib/api-client'
import { LoginScreen } from '@/components/pfc/LoginScreen'
import { AdminConsole } from '@/components/pfc/AdminConsole'
import { ClienteArea } from '@/components/pfc/ClienteArea'
import { PreviewModal } from '@/components/pfc/PreviewModal'

export default function Home() {
  const { user, loadingUser, setUser, setLoadingUser, previewFile } = usePfcStore()

  useEffect(() => {
    (async () => {
      try { await api.setup() } catch {}
      try {
        const { user } = await api.auth.me()
        setUser(user)
      } catch {
        setUser(null)
      } finally {
        setLoadingUser(false)
      }
    })()
  }, [setUser, setLoadingUser])

  if (loadingUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center text-white font-extrabold text-xl shadow-lg">P</div>
          <p className="text-slate-500 text-sm">Caricamento portale...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {!user && <LoginScreen />}
      {user?.role === 'admin' && <AdminConsole />}
      {user?.role === 'client' && <ClienteArea />}
      {previewFile && <PreviewModal />}
    </>
  )
}
