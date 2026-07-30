/**
 * GET /api/push/vapid-key
 *   - Ritorna la chiave pubblica VAPID al client (serve per PushManager.subscribe).
 *   - La chiave pubblica è pubblica per definizione, può essere esposta al browser.
 */

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey) {
    return NextResponse.json(
      { error: 'VAPID non configurato. Manca NEXT_PUBLIC_VAPID_PUBLIC_KEY.' },
      { status: 500 }
    )
  }
  return NextResponse.json({ publicKey })
}
