/* eslint-disable @typescript-eslint/no-explicit-any */
/** Mock del client Prisma: le funzioni usate da scadenza-notify.
 *  Implementa la semantica findFirst/findMany/create/updateMany/deleteMany
 *  su un array in memoria (dove/dettaglio/type/ts gte+lt/OR/orderBy), cosi'
 *  i test asseriscono sullo STATO delle righe, non sulle chiamate mock. */
export type NotificaMock = {
  id: string
  userId: string
  type: string
  text: string
  detail: string
  ts: Date
  read?: boolean
}

export let notifiche: NotificaMock[] = []
export const seq = { n: 0 }

export function resetNotifiche() {
  notifiche = []
  seq.n = 0
}

/** Lettura sempre viva dello stato corrente (evita binding CJS stantii). */
export function elenco(): NotificaMock[] {
  return notifiche
}

export function aggiungiNotifica(n: Partial<NotificaMock> & Pick<NotificaMock, 'userId' | 'type' | 'detail'>): NotificaMock {
  const riga: NotificaMock = {
    id: n.id ?? 'n' + ++seq.n,
    userId: n.userId,
    type: n.type,
    text: n.text ?? '',
    detail: n.detail,
    ts: n.ts ?? new Date(),
    read: n.read ?? false,
  }
  notifiche.push(riga)
  return riga
}

function matcha(n: NotificaMock, w: any): boolean {
  if (w.userId !== undefined && n.userId !== w.userId) return false
  if (w.detail !== undefined && n.detail !== w.detail) return false
  if (w.type !== undefined && n.type !== w.type) return false
  if (w.id !== undefined) {
    if (typeof w.id === 'string') {
      if (n.id !== w.id) return false
    } else if (Array.isArray(w.id.in) && !w.id.in.includes(n.id)) {
      return false
    }
  }
  if (w.ts?.gte !== undefined && !(n.ts.getTime() >= new Date(w.ts.gte).getTime())) return false
  if (w.ts?.lt !== undefined && !(n.ts.getTime() < new Date(w.ts.lt).getTime())) return false
  if (w.OR && !w.OR.some((o: any) => matcha(n, o))) return false
  return true
}

function ordina(rows: NotificaMock[], orderBy?: any): NotificaMock[] {
  if (orderBy?.ts === 'desc') return [...rows].sort((a, b) => b.ts.getTime() - a.ts.getTime())
  return rows
}

export const db = {
  notification: {
    findFirst: jest.fn(async ({ where, orderBy }: any) => {
      return ordina(notifiche.filter((n) => matcha(n, where)), orderBy)[0] ?? null
    }),
    findMany: jest.fn(async ({ where, orderBy }: any) => {
      return ordina(notifiche.filter((n) => matcha(n, where)), orderBy)
    }),
    create: jest.fn(async ({ data }: any) => {
      const riga: NotificaMock = {
        id: 'n' + ++seq.n,
        userId: data.userId,
        type: data.type,
        text: data.text ?? '',
        detail: data.detail,
        ts: data.ts ?? new Date(), // come @default(now()) di Prisma
        read: false,
      }
      notifiche.push(riga)
      return riga
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const riga = notifiche.find((n) => n.id === where.id)
      if (!riga) throw new Error('record not found')
      Object.assign(riga, data)
      return riga
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const rows = notifiche.filter((n) => matcha(n, where))
      rows.forEach((n) => Object.assign(n, data))
      return { count: rows.length }
    }),
    deleteMany: jest.fn(async ({ where }: any) => {
      const prima = notifiche.length
      notifiche = notifiche.filter((n) => !matcha(n, where))
      return { count: prima - notifiche.length }
    }),
  },
  scadenza: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  fcmToken: { count: jest.fn() },
  pushSubscription: { count: jest.fn() },
}
