import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, logAudit } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const KEY = 'maintenance_mode'

export async function GET() {
  const setting = await db.systemSetting.findUnique({ where: { key: KEY } })
  return NextResponse.json({ attivo: setting?.value === '1' })
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }
  const { attivo } = await req.json().catch(() => ({}))
  const value = attivo ? '1' : '0'
  await db.systemSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value },
  })
  await logAudit(session.sub, 'MANUTENZIONE', value === '1' ? 'ATTIVATA' : 'DISATTIVATA')
  return NextResponse.json({ ok: true, attivo: value === '1' })
}
