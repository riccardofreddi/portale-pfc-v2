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
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="pfc-mark w-11 h-11 rounded-md bg-emerald-800 text-emerald-50 flex items-center justify-center text-sm">PFC</div>
          <p className="text-muted-foreground text-sm font-mono">Caricamento portale…</p>
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
