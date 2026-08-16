import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession, hashPassword, validaUsername, validaPassword, logAudit } from '@/lib/auth'
import { DEFAULT_ADMIN_USER, validaEmail } from '@/lib/pfc-utils'

export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const session = await getSession()
  if (!session || session.role !== 'admin') return null
  return session
}

export async function GET() {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const users = await db.user.findMany({
    where: { role: 'client' },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({
    clienti: users.map((u) => ({
      username: u.username,
      name: u.name,
      email: u.email,
      exemptMaintenance: u.exemptMaintenance,
      createdAt: u.createdAt,
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const ragioneSociale = String(body.name ?? '').trim()
  const password = String(body.password ?? '')

  const v = validaUsername(String(body.username ?? ''))
  if (!v.ok) {
    console.error('[clienti POST] 400 validaUsername', { raw: body.username, msg: v.msg })
    return NextResponse.json({ error: v.msg, field: 'username' }, { status: 400 })
  }
  const username = v.normalized!

  if (!ragioneSociale) {
    console.error('[clienti POST] 400 ragioneSociale vuota')
    return NextResponse.json({ error: 'Inserisci la ragione sociale', field: 'name' }, { status: 400 })
  }
  if (username === DEFAULT_ADMIN_USER) {
    return NextResponse.json({ error: 'Username riservato allamministratore', field: 'username' }, { status: 400 })
  }

  // Email opzionale: se fornita deve essere valida e univoca.
  const ve = validaEmail(String(body.email ?? ''))
  if (!ve.ok) {
    return NextResponse.json({ error: ve.msg, field: 'email' }, { status: 400 })
  }
  if (ve.normalized) {
    const clashEmail = await db.user.findUnique({ where: { email: ve.normalized } })
    if (clashEmail) return NextResponse.json({ error: 'Email gia associata a un altro cliente', field: 'email' }, { status: 400 })
  }

  const existing = await db.user.findUnique({ where: { username } })
  if (existing) return NextResponse.json({ error: `Username ${username} gia esistente`, field: 'username' }, { status: 400 })

  const vp = validaPassword(password)
  if (!vp.ok) {
    console.error('[clienti POST] 400 validaPassword', { len: password.length, msg: vp.msg })
    return NextResponse.json({ error: vp.msg, field: 'password' }, { status: 400 })
  }

  await db.user.create({
    data: {
      username,
      name: ragioneSociale,
      email: ve.normalized,
      passwordHash: hashPassword(password),
      role: 'client',
    },
  })

  await logAudit(session.sub, 'CREA_CLIENTE', `${ragioneSociale} (${username})`)
  return NextResponse.json({ ok: true, username })
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const { username } = await req.json().catch(() => ({}))
  if (!username || username === DEFAULT_ADMIN_USER) {
    return NextResponse.json({ error: 'Username non valido' }, { status: 400 })
  }

  const target = await db.user.findUnique({ where: { username } })
  if (!target) return NextResponse.json({ error: 'Cliente non trovato' }, { status: 404 })

  await db.user.delete({ where: { id: target.id } })

  try {
    const { eliminaPrefisso, DOCS_PREFIX } = await import('@/lib/r2')
    await eliminaPrefisso(`${DOCS_PREFIX}/${username}/`)
  } catch (err) {
    console.error('[delete cliente] R2 cleanup fallito:', err)
  }

  await logAudit(session.sub, 'ELIMINA_CLIENTE', `${target.name} (${username})`)
  return NextResponse.json({ ok: true })
}

export async function PUT(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { oldUsername, newUsername, newName, newPassword, newEmail } = body as {
    oldUsername: string
    newUsername: string
    newName: string
    newPassword?: string
    newEmail?: string
  }

  if (!oldUsername || !newUsername || !newName) {
    return NextResponse.json({ error: 'Parametri mancanti' }, { status: 400 })
  }

  const v = validaUsername(newUsername)
  if (!v.ok) return NextResponse.json({ error: v.msg }, { status: 400 })
  const nuovoUsername = v.normalized!

  if (nuovoUsername === DEFAULT_ADMIN_USER) {
    return NextResponse.json({ error: 'Username riservato allamministratore' }, { status: 400 })
  }

  const target = await db.user.findUnique({ where: { username: oldUsername } })
  if (!target) return NextResponse.json({ error: 'Cliente non trovato' }, { status: 404 })

  if (nuovoUsername !== oldUsername) {
    const clash = await db.user.findUnique({ where: { username: nuovoUsername } })
    if (clash) return NextResponse.json({ error: `Username ${nuovoUsername} gia esistente` }, { status: 400 })
  }

  // Email opzionale: se fornita deve essere valida e univoca (escluso se stesso).
  const ve = validaEmail(String(newEmail ?? ''))
  if (!ve.ok) return NextResponse.json({ error: ve.msg, field: 'email' }, { status: 400 })
  if (ve.normalized && ve.normalized !== target.email) {
    const clashEmail = await db.user.findUnique({ where: { email: ve.normalized } })
    if (clashEmail) return NextResponse.json({ error: 'Email gia associata a un altro cliente', field: 'email' }, { status: 400 })
  }

  let newHash = target.passwordHash
  if (newPassword) {
    const vp = validaPassword(newPassword)
    if (!vp.ok) return NextResponse.json({ error: vp.msg }, { status: 400 })
    newHash = hashPassword(newPassword)
  }

  await db.user.update({
    where: { id: target.id },
    data: {
      username: nuovoUsername,
      name: newName,
      email: ve.normalized,
      passwordHash: newHash,
    },
  })

  await logAudit(session.sub, 'MODIFICA_CLIENTE', `${oldUsername} -> ${nuovoUsername} (${newName})`)
  return NextResponse.json({ ok: true })
}
