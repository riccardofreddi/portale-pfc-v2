/** API client minimale per il frontend. */

async function apiFetch<T = unknown>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts?.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(opts?.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = (data as { error?: string }).error ?? `Errore ${res.status}`
    throw new Error(msg)
  }
  return data as T
}

export const api = {
  auth: {
    me: () => apiFetch<{ user: { username: string; name: string; role: 'admin' | 'client'; exemptMaintenance?: boolean } | null }>('/api/auth/me'),
    login: (username: string, password: string) =>
      apiFetch<{ ok: boolean; user?: unknown; error?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    logout: () => apiFetch('/api/auth/logout', { method: 'POST' }),
  },
  clienti: {
    list: () => apiFetch<{ clienti: Array<{ username: string; name: string; exemptMaintenance: boolean; createdAt: string }> }>('/api/clienti'),
    create: (data: { username: string; name: string; password: string }) =>
      apiFetch('/api/clienti', { method: 'POST', body: JSON.stringify(data) }),
    update: (data: { oldUsername: string; newUsername: string; newName: string; newPassword?: string }) =>
      apiFetch('/api/clienti', { method: 'PUT', body: JSON.stringify(data) }),
    delete: (username: string) =>
      apiFetch('/api/clienti', { method: 'DELETE', body: JSON.stringify({ username }) }),
  },
  documenti: {
    list: (params: { username: string; anno?: string; cartella?: string }) => {
      const q = new URLSearchParams({ username: params.username })
      if (params.anno) q.set('anno', params.anno)
      if (params.cartella) q.set('cartella', params.cartella)
      return apiFetch<{ anni?: string[]; cartelle?: Array<Record<string, unknown>>; files?: Array<Record<string, unknown>>; r2NotConfigured?: boolean; error?: string }>(`/api/documenti/list?${q}`)
    },
    upload: (formData: FormData) =>
      apiFetch<{ ok: boolean; results?: Array<Record<string, unknown>> }>('/api/documenti/upload', {
        method: 'POST',
        body: formData,
      }),
    delete: (keys: string[], moveToTrash = true) =>
      apiFetch('/api/documenti/delete', { method: 'POST', body: JSON.stringify({ keys, moveToTrash }) }),
  },
  avvisi: {
    list: () => apiFetch<{ avvisi: Array<{ id: string; text: string; timestamp: string }> }>('/api/avvisi'),
    create: (text: string) => apiFetch('/api/avvisi', { method: 'POST', body: JSON.stringify({ text }) }),
    delete: (id: string) => apiFetch(`/api/avvisi?id=${id}`, { method: 'DELETE' }),
  },
  messaggi: {
    list: (username: string) =>
      apiFetch<{ messaggi: Array<Record<string, unknown>> }>(`/api/messaggi?username=${encodeURIComponent(username)}`),
    send: (data: { destinatario: string; testo: string; richiedeUpload: boolean }) =>
      apiFetch('/api/messaggi', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch(`/api/messaggi?id=${id}`, { method: 'DELETE' }),
    archivia: (id: string) => apiFetch(`/api/messaggi?id=${id}&action=archivia`, { method: 'PATCH' }),
    segnaLetti: () => apiFetch('/api/messaggi?action=segna_letti', { method: 'PATCH' }),
  },
  notifiche: {
    list: () => apiFetch<{ notifiche: Array<Record<string, unknown>> }>('/api/notifiche'),
    segnaLette: () => apiFetch('/api/notifiche?action=segna_lette', { method: 'POST' }),
    pulisciLette: () => apiFetch('/api/notifiche?action=pulisci_lette', { method: 'POST' }),
    pulisciTutte: () => apiFetch('/api/notifiche?action=pulisci_tutte', { method: 'POST' }),
  },
  preferiti: {
    list: () => apiFetch<{ preferiti: string[] }>('/api/preferiti'),
    toggle: (filePath: string) => apiFetch<{ ok: boolean; isPreferito: boolean }>('/api/preferiti', { method: 'POST', body: JSON.stringify({ filePath }) }),
  },
  audit: {
    list: (limit?: number, username?: string) => {
      const q = new URLSearchParams()
      if (limit) q.set('limit', String(limit))
      if (username) q.set('username', username)
      return apiFetch<{ logs: Array<{ id: string; ts: string; username: string; action: string; detail: string }> }>(`/api/audit?${q}`)
    },
    meList: (limit?: number) => {
      const q = limit ? `?limit=${limit}` : ''
      return apiFetch<{ logs: Array<{ id: string; ts: string; action: string; detail: string }> }>(`/api/audit/me${q}`)
    },
    reset: () => apiFetch('/api/audit', { method: 'DELETE' }),
  },
  sistema: {
    manutenzione: {
      get: () => apiFetch<{ attivo: boolean }>('/api/sistema/manutenzione'),
      toggle: (attivo: boolean) => apiFetch<{ ok: boolean; attivo: boolean }>('/api/sistema/manutenzione', { method: 'POST', body: JSON.stringify({ attivo }) }),
    },
    diagnostica: () => apiFetch<{ db: { tabelle: Array<{ nome: string; righe: number }> }; r2: { configurato: boolean; nFiles: number; sizeTotale: number; errore: string | null } }>('/api/sistema/diagnostica'),
  },
  resoconto: () => apiFetch<{ stats: Array<Record<string, unknown>>; r2NotConfigured?: boolean }>('/api/resoconto'),
  setup: () => apiFetch('/api/setup'),
  cassetto: {
    list: (username?: string) => {
      const q = username ? `?username=${encodeURIComponent(username)}` : ''
      return apiFetch<{ files: Array<{ nome: string; key: string; size: number; sizeStr: string; lastModified: Date | null }> }>(`/api/cassetto/list${q}`)
    },
    upload: (formData: FormData, username?: string) => {
      const q = username ? `?username=${encodeURIComponent(username)}` : ''
      return apiFetch<{ ok: boolean; key: string; nome: string }>(`/api/cassetto/upload${q}`, {
        method: 'POST',
        body: formData,
      })
    },
    delete: (key: string) =>
      apiFetch<{ ok: boolean }>('/api/cassetto/delete', { method: 'POST', body: JSON.stringify({ key }) }),
    rename: (key: string, newName: string) =>
      apiFetch<{ ok: boolean; newKey: string; newName: string }>('/api/cassetto/rename', { method: 'POST', body: JSON.stringify({ key, newName }) }),
  },
  risposte: {
    upload: (formData: FormData) =>
      apiFetch<{ ok: boolean; key: string; nome: string }>('/api/risposte/upload', {
        method: 'POST',
        body: formData,
      }),
  },
  ricerca: (q: string, username?: string) => {
    const params = new URLSearchParams({ q })
    if (username) params.set('username', username)
    return apiFetch<{ results: Array<{ nome: string; key: string; anno: string; cartella: string; size: number; sizeStr: string; score: number }> }>(`/api/ricerca?${params}`)
  },
}
