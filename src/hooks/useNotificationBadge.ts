"use client"

import { useEffect, useRef } from "react"
import { api } from "@/lib/api-client"

export function useNotificationBadge(enabled: boolean) {
  const previousCountRef = useRef<number>(0)

  useEffect(() => {
    if (!enabled) return

    let isMounted = true

    async function checkAndUpdate() {
      try {
        const { notifiche } = await api.notifiche.list()
        if (!isMounted) return

        const unreadCount = (notifiche as Array<{ read: boolean }>).filter((n) => !n.read).length

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

        if (unreadCount > previousCountRef.current && previousCountRef.current !== -1) {
          playNotificationSound()
        }
        previousCountRef.current = unreadCount

        if (unreadCount > 0) {
          document.title = `(${unreadCount}) Portale PFC`
        } else {
          document.title = "Portale PFC"
        }
      } catch {}
    }

    previousCountRef.current = -1
    checkAndUpdate().then(() => {
      if (isMounted) previousCountRef.current = 0
    })

    const interval = setInterval(checkAndUpdate, 30_000)

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        checkAndUpdate()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      isMounted = false
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibility)
      if ("clearAppBadge" in navigator) {
        ;(navigator as Navigator & {
          clearAppBadge: () => Promise<void>
        }).clearAppBadge().catch(() => {})
      }
      document.title = "Portale PFC"
    }
  }, [enabled])
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