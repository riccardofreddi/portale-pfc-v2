'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Megaphone, Inbox } from 'lucide-react'
import { formatDateAudit } from '@/lib/pfc-utils'

interface Avviso { id: string; text: string; timestamp: string }

export function ClienteAvvisi() {
  const [avvisi, setAvvisi] = useState<Avviso[]>([])

  useEffect(() => {
    api.avvisi.list().then((r) => setAvvisi(r.avvisi)).catch(() => {})
  }, [])

  if (avvisi.length === 0) return (
    <Card><CardContent className="py-12 text-center">
      <Inbox className="h-10 w-10 text-slate-300 mx-auto mb-3" />
      <p className="text-slate-700 font-medium mb-1">Nessun avviso</p>
      <p className="text-sm text-slate-500">Non ci sono comunicazioni attive dallo studio.</p>
    </CardContent></Card>
  )

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Megaphone className="h-5 w-5 text-amber-500" /> Comunicazioni dello Studio</h3>
      {avvisi.map((a) => (
        <div key={a.id} className="bg-gradient-to-br from-amber-50 to-amber-50/30 border border-amber-200 border-l-4 border-l-amber-500 rounded-xl p-4">
          <p className="text-xs text-amber-700 font-semibold mb-1.5">Comunicazione dello Studio - {formatDateAudit(a.timestamp)}</p>
          <p className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">{a.text}</p>
        </div>
      ))}
    </div>
  )
}
