import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  hashPassword, verifyPassword, validaUsername,
  verificaBloccoLogin, registraTentativoFallito,
  resetTentativi, creaSessione, setSessionCookie, logAudit,
} from '@/lib/auth'
import { DEFAULT_ADMIN_USER } from '@/lib/pfc-utils'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const usernameRaw = String(body.username ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')

    if (!usernameRaw || !password) {
      return NextResponse.json({ ok: false, error: 'Inserisci username e password' }, { status: 400 })
    }

    const v = validaUsername(usernameRaw)
    if (!v.ok) return NextResponse.json({ ok: false, error: v.msg }, { status: 400 })
    const username = v.normalized!

    const waitSec = await verificaBloccoLogin(username)
    if (waitSec > 0) {
      return NextResponse.json({ ok: false, error: `Troppi tentativi falliti. Riprova tra ${waitSec} secondi.` }, { status: 429 })
    }

    const user = await db.user.findUnique({ where: { username } })
    if (!user || !verifyPassword(password, user.passwordHash)) {
      const waitAfter = await registraTentativoFallito(username)
      if (username !== DEFAULT_ADMIN_USER) await logAudit(username, 'LOGIN_FAILED', 'Password sbagliata')
      const msg = waitAfter > 0 ? `Troppi tentativi falliti. Riprova tra ${waitAfter} secondi.` : 'Username o password non corretti. Riprova.'
      return NextResponse.json({ ok: false, error: msg }, { status: 401 })
    }

    // BLOCCO MANUTENZIONE: se attiva e il cliente non è esente, rifiuta login
    if (username !== DEFAULT_ADMIN_USER) {
      const maintSetting = await db.systemSetting.findUnique({ where: { key: 'maintenance_mode' } })
      if (maintSetting?.value === '1' && !user.exemptMaintenance) {
        await logAudit(username, 'LOGIN_BLOCCATO', 'Manutenzione attiva')
        return NextResponse.json({ ok: false, error: 'Il portale è in manutenzione. Riprova più tardi.' }, { status: 503 })
      }
    }

    await resetTentativi(username)
    if (!user.passwordHash.startsWith('pbkdf2_sha256$')) {
      await db.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(password) } })
    }

    const role: 'admin' | 'client' = user.role === 'admin' ? 'admin' : 'client'
    const jwt = await creaSessione({ username, name: user.name, role })
    await setSessionCookie(jwt)

    if (username !== DEFAULT_ADMIN_USER) await logAudit(username, 'LOGIN_SUCCESS', 'Accesso eseguito')

    return NextResponse.json({
      ok: true,
      user: { username, name: user.name, role, exemptMaintenance: user.exemptMaintenance },
    })
  } catch (err) {
    console.error('[login] errore:', err)
    return NextResponse.json({ ok: false, error: 'Errore interno del server' }, { status: 500 })
  }
}
