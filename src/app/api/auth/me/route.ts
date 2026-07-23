import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ user: null })

  const user = await db.user.findUnique({ where: { username: session.sub } })
  if (!user) return NextResponse.json({ user: null })

  return NextResponse.json({
    user: {
      username: user.username,
      name: user.name,
      role: user.role === 'admin' ? 'admin' : 'client',
      exemptMaintenance: user.exemptMaintenance,
    },
  })
}
