import { NextResponse } from 'next/server'
import { ensureDefaultAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await ensureDefaultAdmin()
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[setup] errore:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
