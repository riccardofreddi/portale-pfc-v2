/**
 * Portale PFC — Autenticazione custom (PBKDF2-HMAC-SHA256).
 */

import crypto from 'crypto'
import { db } from './db'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const ITERATIONS = 100_000
const KEY_LENGTH = 32
const DIGEST = 'sha256'
const SESSION_COOKIE = 'pfc_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7
const JWT_SECRET = new TextEncoder().encode(process.env.APP_SECRET ?? 'dev-secret-change-me')

const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_BLOCK_DURATION_SEC = 60

const DEFAULT_ADMIN_USER = 'admin'
const DEFAULT_ADMIN_PASSWORD = 'admin'

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST)
  return `pbkdf2_sha256$${ITERATIONS}$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (storedHash.startsWith('pbkdf2_sha256$')) {
    return verifyPbkdf2(password, storedHash)
  }
  const computed = crypto.createHash('sha256').update(password, 'utf8').digest('hex')
  if (computed.length !== storedHash.length) return false
  return crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(storedHash, 'hex'))
}

function verifyPbkdf2(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split('$')
    if (parts.length !== 4) return false
    const algorithm = parts[0]
    const iterations = parseInt(parts[1], 10)
    const salt = Buffer.from(parts[2], 'hex')
    const storedHashBytes = Buffer.from(parts[3], 'hex')
    if (algorithm !== 'pbkdf2_sha256') return false
    const newHash = crypto.pbkdf2Sync(password, salt, iterations, storedHashBytes.length, DIGEST)
    return crypto.timingSafeEqual(newHash, storedHashBytes)
  } catch {
    return false
  }
}

export function validaUsername(username: string): { ok: boolean; msg: string; normalized?: string } {
  const u = username.trim().toLowerCase()
  if (u.length < 3) return { ok: false, msg: 'Username deve avere almeno 3 caratteri' }
  if (u.length > 20) return { ok: false, msg: 'Username non puo superare 20 caratteri' }
  if (!/^[a-z0-9]+$/.test(u)) return { ok: false, msg: 'Username puo contenere solo lettere e numeri' }
  return { ok: true, msg: '', normalized: u }
}

export function validaPassword(password: string): { ok: boolean; msg: string } {
  if (password.length < 4) return { ok: false, msg: 'Password deve avere almeno 4 caratteri' }
  if (password.length > 50) return { ok: false, msg: 'Password troppo lunga (max 50 caratteri)' }
  return { ok: true, msg: '' }
}

export interface SessionPayload {
  sub: string
  name: string
  role: 'admin' | 'client'
  iat: number
  exp: number
}

export async function creaSessione(payload: { username: string; name: string; role: 'admin' | 'client' }) {
  const now = Math.floor(Date.now() / 1000)
  const jwt = await new SignJWT({
    sub: payload.username,
    name: payload.name,
    role: payload.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_TTL_SECONDS)
    .sign(JWT_SECRET)
  return jwt
}

export async function verificaSessione(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    if (typeof payload.sub !== 'string' || typeof payload.name !== 'string' || payload.role !== 'admin' && payload.role !== 'client') {
      return null
    }
    return {
      sub: payload.sub,
      name: payload.name as string,
      role: payload.role as 'admin' | 'client',
      iat: payload.iat ?? 0,
      exp: payload.exp ?? 0,
    }
  } catch {
    return null
  }
}

export async function getSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verificaSessione(token)
}

export async function setSessionCookie(jwt: string) {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

export async function verificaBloccoLogin(username: string): Promise<number> {
  const cutoff = new Date(Date.now() - LOGIN_BLOCK_DURATION_SEC * 1000)
  const tentativi = await db.loginAttempt.findMany({
    where: { username, ts: { gt: cutoff } },
    orderBy: { ts: 'asc' },
  })
  if (tentativi.length >= LOGIN_MAX_ATTEMPTS) {
    const primo = tentativi[0].ts.getTime()
    const waitSec = Math.max(0, LOGIN_BLOCK_DURATION_SEC - Math.floor((Date.now() - primo) / 1000))
    return waitSec
  }
  return 0
}

export async function registraTentativoFallito(username: string): Promise<number> {
  await db.loginAttempt.create({ data: { username } })
  return verificaBloccoLogin(username)
}

export async function resetTentativi(username: string): Promise<void> {
  await db.loginAttempt.deleteMany({ where: { username } })
}

export async function ensureDefaultAdmin() {
  const existing = await db.user.findUnique({ where: { username: DEFAULT_ADMIN_USER } })
  if (existing) return
  await db.user.create({
    data: {
      username: DEFAULT_ADMIN_USER,
      name: 'Titolare',
      passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
      role: 'admin',
    },
  })
  console.log(`[AUTH] Admin di default creato: ${DEFAULT_ADMIN_USER} / ${DEFAULT_ADMIN_PASSWORD}`)
}

export async function logAudit(username: string, action: string, detail: string = '', knownUserId?: string | null) {
  // Non loggare le azioni dell'admin per risparmiare spazio nel DB
  if (username === 'admin') return
  try {
    const userId = knownUserId !== undefined ? knownUserId : (await db.user.findUnique({ where: { username }, select: { id: true } }))?.id ?? null
    await db.auditLog.create({
      data: {
        username,
        action,
        detail,
        userId,
      },
    })
  } catch (err) {
    console.error('[AUDIT] errore scrittura:', err)
  }
}
