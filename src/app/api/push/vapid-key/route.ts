import { NextResponse } from 'next/server'

export const dynamic = 'force-static'

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  if (!publicKey) {
    return NextResponse.json({ error: 'VAPID non configurato' }, { status: 500 })
  }
  return NextResponse.json({ publicKey })
}
