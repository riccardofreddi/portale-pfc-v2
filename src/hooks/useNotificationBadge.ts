"use client"

import { useEffect, useRef } from "react"
import { api } from "@/lib/api-client"
import { usePfcStore } from "@/store/pfc"
import { toast } from "sonner"
import { updateFaviconBadge, restoreFavicon } from "@/lib/favicon-badge"

interface NotificaInfo {
  id: string
  type: string
  text: string
  detail: string
  ts: string
  read: boolean
}

const POLL_INTERVAL_MS = 5000

export function useNotificationBadge(enabled: boolean) {
  const setNNotifiche = usePfcStore((s) => s.setNNotifiche)
  const previousCountRef = useRef<number>(-1)
  const previousNotificheRef = useRef<Set<string>>(new Set())
  const isMountedRef = useRef<boolean>(true)

  // Il suono in-app suona SOLO quando la pagina è visibile:
  // quando è dietro le quinte (o chiusa), ci pensa già la notifica
  // di sistema del Service Worker — così niente doppio suono.
  const isPageVisible = () => document.visibilityState === 'visible'

  useEffect(() => {
    if (!enabled) return
    isMountedRef.current = true

    async function checkAndUpdate() {
      if (!isMountedRef.current) return
      try {
        const { notifiche } = await api.notifiche.list()
        if (!isMountedRef.current) return

        const notifList = notifiche as unknown as NotificaInfo[]
        const unreadCount = notifList.filter((n) => !n.read).length
        const unreadIds = new Set(notifList.filter((n) => !n.read).map((n) => n.id))

        // Aggiorna il conteggio globale -> campanella in TopBar + pannello
        setNNotifiche(unreadCount)

        if ("setAppBadge" in navigator) {
          if (unreadCount > 0) {
            await (navigator as Navigator & {
              setAppBadge: (count?: number) => Promise<void>
            }).setAppBadge(unreadCount).catch(() => {})
          } else {
            await (navigator as Navigator & {
              clearAppBadge: () => Promise<void>
            }).clearAppBadge().catch(() => {})
          }
        }

        // Favicon badge: funziona anche quando l'app gira come TAB del browser
        // (su Windows/Chrome setAppBadge mostra il numero SOLO su PWA installata)
        if (unreadCount > 0) {
          updateFaviconBadge(unreadCount)
        } else {
          restoreFavicon()
        }

        const newNotifIds = [...unreadIds].filter(
          (id) => !previousNotificheRef.current.has(id)
        )

        if (
          newNotifIds.length > 0 &&
          previousCountRef.current !== -1 &&
          previousCountRef.current !== -2 &&
          isPageVisible()
        ) {
          playNotificationSound()
          const newNotifs = notifList.filter((n) => newNotifIds.includes(n.id)).slice(0, 3)
          for (const n of newNotifs) {
            const icon = getNotifIcon(n.type)
            const title = getNotifTitle(n.type)
            toast(title, {
              description: n.text.slice(0, 100),
              icon,
              duration: 6000,
            })
          }
        }

        previousCountRef.current = unreadCount
        previousNotificheRef.current = unreadIds

        if (unreadCount > 0) {
          document.title = `(${unreadCount}) Portale PFC`
        } else {
          document.title = "Portale PFC"
        }
      } catch {}
    }

    previousCountRef.current = -2
    checkAndUpdate().then(() => {
      if (isMountedRef.current) previousCountRef.current = 0
    })

    const interval = setInterval(checkAndUpdate, POLL_INTERVAL_MS)

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        checkAndUpdate()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)

    const onFocus = () => checkAndUpdate()
    window.addEventListener("focus", onFocus)

    // Messaggi segnati come letti (tab Messaggi aperta): azzera subito badge,
    // favicon e titolo invece di aspettare il polling di 5 s.
    const onMessaggiLetti = () => checkAndUpdate()
    window.addEventListener("pfc-messaggi-letti", onMessaggiLetti)

    // Documento aperto in anteprima o scaricato: il server segna lette le
    // notifiche "documento_nuovo" → aggiorna subito il badge della campanella.
    const onDocumentiVisti = () => checkAndUpdate()
    window.addEventListener("pfc-documenti-visti", onDocumentiVisti)

    // Comunicazione dal Service Worker: quando arriva una push,
    // aggiorna immediatamente badge e conteggio (senza aspettare il polling)
    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type === "PUSH_RECEIVED") {
        // Avviso globale con pagina già aperta e visibile: la push porta
        // data.avviso (nessuna notifica "non letta" in campanella), quindi il
        // suono in-app + toast partono da qui, stessa logica degli avvisi privati.
        if (event.data?.data?.avviso && isPageVisible()) {
          const avvisoText = String(event.data.data.avviso?.text ?? "").slice(0, 100)
          playNotificationSound()
          toast(getNotifTitle("avviso"), {
            description: avvisoText,
            icon: getNotifIcon("avviso"),
            duration: 6000,
          })
        }
        // Conferma al Service Worker che questa pagina (loggata e visibile) gestirà la
        // notifica in-app (suono + toast): il SW non mostrerà la notifica di sistema.
        // IMPORTANTE: visible:true indica che questo client è loggato e visibile —
        // il SW si fida di questa dichiarazione (non può leggerla direttamente).
        if (event.data?.ack && isPageVisible()) {
          const ack = { type: 'PUSH_ACK', visible: true }
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage(ack)
          } else {
            navigator.serviceWorker.ready
              .then((reg) => reg.active?.postMessage(ack))
              .catch(() => {})
          }
        }
        checkAndUpdate()
      }
      if (event.data?.type === "BADGE_UPDATE") {
        checkAndUpdate()
      }
    }
    navigator.serviceWorker?.addEventListener("message", onSwMessage)

    return () => {
      isMountedRef.current = false
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("pfc-messaggi-letti", onMessaggiLetti)
      window.removeEventListener("pfc-documenti-visti", onDocumentiVisti)
      navigator.serviceWorker?.removeEventListener("message", onSwMessage)
      if ("clearAppBadge" in navigator) {
        ;(navigator as Navigator & {
          clearAppBadge: () => Promise<void>
        }).clearAppBadge().catch(() => {})
      }
      document.title = "Portale PFC"
    }
  }, [enabled, setNNotifiche])
}

function getNotifIcon(type: string): string {
  switch (type) {
    case "messaggio":
      return "💬"
    case "richiesta_upload":
      return "📥"
    case "avviso":
      return "📢"
    case "documento_nuovo":
      return "📄"
    case "upload_confermato":
      return "✅"
    default:
      return "🔔"
  }
}

function getNotifTitle(type: string): string {
  switch (type) {
    case "messaggio":
      return "Nuovo messaggio dallo studio"
    case "richiesta_upload":
      return "Richiesta documento"
    case "avviso":
      return "Nuovo avviso dallo studio"
    case "documento_nuovo":
      return "Nuovo documento disponibile"
    case "upload_confermato":
      return "Upload confermato"
    default:
      return "Portale PFC"
  }
}

function playNotificationSound() {
  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return

    const ctx = new AudioCtx()
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.type = "sine"
    oscillator.frequency.setValueAtTime(880, ctx.currentTime)
    oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1)

    gainNode.gain.setValueAtTime(0.0001, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.3)

    setTimeout(() => ctx.close().catch(() => {}), 500)
  } catch {}
}