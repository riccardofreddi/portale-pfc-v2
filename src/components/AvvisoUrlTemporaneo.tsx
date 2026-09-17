'use client'

/**
 * v4.57: cartello stradale contro gli indirizzi temporanei di Vercel.
 *
 * PERCHE' ESISTE: dopo ogni aggiornamento (redeploy) il pannello Vercel mostra
 * un link del tipo "portale-pfc-v2-ageux8cs4-....vercel.app". Se il portale
 * viene aperto da li', le notifiche attivate da quella pagina:
 *   1. arrivano con l'etichetta lunghissima (il "token strano" della foto),
 *   2. smettono di funzionare al prossimo aggiornamento, perche' l'indirizzo
 *      temporaneo cambia ogni volta.
 * Il server ormai RIFIUTA comunque quelle iscrizioni (vedi
 * subscribe/route.ts, guardia v4.57); questo cartello spiega subito, IN
 * PAGINA, come arrivare all'indirizzo giusto con un click.
 *
 * L'avviso appare SOLO se l'indirizzo in uso non e' quello ufficiale (ne'
 * localhost per le prove): sull'indirizzo ufficiale non si vede niente.
 */

import { useEffect, useState } from 'react'

const INDIRIZZO_UFFICIALE = 'portale-pfc-v2.vercel.app'

export default function AvvisoUrlTemporaneo() {
  const [mostra, setMostra] = useState(false)
  const [linkBuono, setLinkBuono] = useState(`https://${INDIRIZZO_UFFICIALE}`)

  useEffect(() => {
    const host = window.location.hostname
    if (host === INDIRIZZO_UFFICIALE || host === 'localhost' || host === '127.0.0.1') return
    setMostra(true)
    // Portiamo con noi la pagina in cui ci troviamo: il link apre lo stesso
    // schermo, ma dall'indirizzo buono.
    setLinkBuono(
      `https://${INDIRIZZO_UFFICIALE}${window.location.pathname}${window.location.search}`
    )
  }, [])

  if (!mostra) return null

  return (
    <div className="w-full bg-amber-100 border-b border-amber-300 text-amber-900 text-sm">
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold">⚠️ Sei su un indirizzo temporaneo di Vercel.</span>
        <span>
          {'Le notifiche attivate da qui portano una etichetta strana e smettono di funzionare al prossimo aggiornamento.'}
        </span>
        <a href={linkBuono} className="underline font-semibold hover:text-amber-700">
          {'Vai all\u2019indirizzo ufficiale'} ({INDIRIZZO_UFFICIALE}) →
        </a>
      </div>
    </div>
  )
}
