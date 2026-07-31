import { create } from 'zustand'

export interface User {
  username: string
  name: string
  role: 'admin' | 'client'
  exemptMaintenance?: boolean
}

export interface FileItem {
  nome: string
  key: string
  size: number
  sizeStr: string
  lastModified: Date | null
  stato: 'preferito' | 'nuovo' | 'visto' | 'scaricato'
  isPreferito: boolean
}

export type AdminTab = 'invio' | 'clienti' | 'bacheca' | 'cestino' | 'risposte' | 'resoconto'
export type ClienteTab = 'archivio' | 'messaggi' | 'cassetto' | 'attivita'

interface PfcState {
  user: User | null
  loadingUser: boolean
  setUser: (u: User | null) => void
  setLoadingUser: (b: boolean) => void
  adminTab: AdminTab
  setAdminTab: (t: AdminTab) => void
  clienteTab: ClienteTab
  setClienteTab: (t: ClienteTab) => void
  annoSelezionato: string | null
  cartellaSelezionata: string | null
  setAnno: (a: string | null) => void
  setCartella: (c: string | null) => void
  previewFile: FileItem | null
  setPreviewFile: (f: FileItem | null) => void
  selectedFiles: Set<string>
  toggleSelected: (key: string) => void
  clearSelected: () => void
  nNotifiche: number
  setNNotifiche: (n: number) => void
  showNotifPanel: boolean
  setShowNotifPanel: (b: boolean) => void
}

export const usePfcStore = create<PfcState>((set) => ({
  user: null,
  loadingUser: true,
  setUser: (u) => set({ user: u }),
  setLoadingUser: (b) => set({ loadingUser: b }),
  adminTab: 'invio',
  setAdminTab: (t) => set({ adminTab: t }),
  clienteTab: 'archivio',
  setClienteTab: (t) => set({ clienteTab: t }),
  annoSelezionato: null,
  cartellaSelezionata: null,
  setAnno: (a) => set({ annoSelezionato: a, cartellaSelezionata: null }),
  setCartella: (c) => set({ cartellaSelezionata: c }),
  previewFile: null,
  setPreviewFile: (f) => set({ previewFile: f }),
  selectedFiles: new Set<string>(),
  toggleSelected: (key) =>
    set((s) => {
      const next = new Set(s.selectedFiles)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { selectedFiles: next }
    }),
  clearSelected: () => set({ selectedFiles: new Set() }),
  nNotifiche: 0,
  setNNotifiche: (n) => set({ nNotifiche: n }),
  showNotifPanel: false,
  setShowNotifPanel: (b) => set({ showNotifPanel: b }),
}))