'use client'

/**
 * Badge dinamico sulla favicon della tab.
 *
 * su Windows/Chrome, navigator.setAppBadge() funziona SOLO su PWA installate.
 * Quando il portale gira come tab del browser, il badge deve essere disegnato
 * direttamente sulla favicon (canvas -> data URL).
 */

let cachedIcon: HTMLImageElement | null = null
let cachedIconPromise: Promise<HTMLImageElement> | null = null
let faviconSet = false

function loadIcon(): Promise<HTMLImageElement> {
  if (cachedIcon) return Promise.resolve(cachedIcon)
  if (cachedIconPromise) return cachedIconPromise

  cachedIconPromise = new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      cachedIcon = img
      resolve(img)
    }
    img.onerror = () => reject(new Error('Icona non caricabile'))
    img.src = '/icon.png'
  })
  return cachedIconPromise
}

export async function updateFaviconBadge(count: number) {
  if (typeof document === 'undefined') return
  try {
    const img = await loadIcon()
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Icona di base
    ctx.drawImage(img, 0, 0, size, size)

    if (count > 0) {
      // Cerchio rosso in alto a destra
      const isLarge = count > 9
      const badgeSize = isLarge ? 30 : 26
      const x = size - badgeSize - 2
      const y = 1

      ctx.beginPath()
      ctx.arc(x + badgeSize / 2, y + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2)
      ctx.fillStyle = '#ef4444'
      ctx.fill()

      ctx.strokeStyle = 'white'
      ctx.lineWidth = 3
      ctx.stroke()

      // Numero
      ctx.fillStyle = 'white'
      ctx.font = `800 ${isLarge ? 16 : 18}px system-ui, -apple-system, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(isLarge ? '9+' : String(count), x + badgeSize / 2, y + badgeSize / 2 + 0.5)
    }

    const url = canvas.toDataURL('image/png')

    let link: HTMLLinkElement | null = document.querySelector('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = url
    faviconSet = true
  } catch {
    restoreFavicon()
  }
}

export function restoreFavicon() {
  if (typeof document === 'undefined') return
  if (!faviconSet) return
  const link: HTMLLinkElement | null = document.querySelector('link[rel="icon"]')
  if (link) link.href = '/icon.png'
  faviconSet = false
}