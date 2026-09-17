/**
 * GET /api/push/fcm/admin
 *   (solo ADMIN) Per OGNI cliente risponde quanti telefoni sono collegati
 *   alle notifiche FCM (tabella fcm_tokens), con dispositivo e data dell'
 *   ultimo aggiornamento. Serve alla tab "Resoconto > Archivio per Cliente"
 *   della pillola "telefono collegato" accanto a "Esente".
 *   SOLO LETTURA: non tocca nessun dato.
 *
 * POST /api/push/fcm/admin
 *   (solo ADMIN) body: { username }
 *   Invia DAVVERO una notifica di prova a TUTTI i canali del cliente indicato:
 *   telefoni (FCM, via sendPushToUser che ripulisce da sola i token morti)
 *   E browser iscritti (Web Push). E' la "Push di prova" del bottone in
 *   Resoconto: se al cliente arriva sia sull'app sia sul browser, il canale
 *   push funziona da capo a fondo. (v4.58: prima arrivava SOLO sui telefoni,
 *   perche' usava sendFcmToUser; il browser restava sempre fuori.)
 *
 * MODULO ADDITIVO: non interferisce con /api/push/fcm (registrazione),
 * /api/push/fcm/test (prova a se stessi) ne' con il Web Push v2.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendPushToUser } from '@/lib/push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const clienti = await db.user.findMany({
      where: { role: 'client' },
      select: { id: true, username: true },
    })

    const tokens = await db.fcmToken.findMany({
      select: { userId: true, device: true, updatedAt: true },
    })

    // Raggruppa i token per utente (dataset piccolo: clienti x telefoni)
    const perUtente = new Map<string, { n: number; dispositivo: string | null; ultimo: Date }>()
    for (const t of tokens) {
      const attuale = perUtente.get(t.userId)
      if (!attuale) {
        perUtente.set(t.userId, { n: 1, dispositivo: t.device, ultimo: t.updatedAt })
      } else {
        attuale.n += 1
        if (t.updatedAt > attuale.ultimo) {
          attuale.ultimo = t.updatedAt
          attuale.dispositivo = t.device
        }
      }
    }

    const mappa: Record<string, { telefoni: number; dispositivo: string | null; ultimoAggiornamento: string | null }> = {}
    for (const c of clienti) {
      const info = perUtente.get(c.id)
      mappa[c.username] = {
        telefoni: info?.n ?? 0,
        dispositivo: info?.dispositivo ?? null,
        ultimoAggiornamento: info ? info.ultimo.toISOString() : null,
      }
    }

    return NextResponse.json({ clienti: mappa })
  } catch (err) {
    console.error('[FCM-ADMIN] errore lettura stato:', err)
    return NextResponse.json({ error: 'Errore server' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const username: string | undefined = body?.username
    if (!username) {
      return NextResponse.json({ error: 'username obbligatorio' }, { status: 400 })
    }

    const user = await db.user.findUnique({
      where: { username },
      select: { id: true, username: true, role: true },
    })
    if (!user || user.role !== 'client') {
      return NextResponse.json({ error: 'Cliente non trovato' }, { status: 404 })
    }

    // v4.58: sendPushToUser tocca TUTTI i canali del cliente (app FCM + browser
    // Web Push). Il conto ritornato e' il totale dei canali raggiunti.
    const inviati = await sendPushToUser(username, {
      title: 'Notifica di prova',
      body: 'Prova di arrivo dallo studio: se stai leggendo questo, le notifiche funzionano!',
      url: '/',
      data: { tipo: 'test' },
    })

    if (inviati === 0) {
      return NextResponse.json({
        ok: false,
        msg: "Nessun canale raggiungibile (0 telefoni e 0 browser). Il telefono si registrera da solo alla prossima apertura dell'app; per il browser il cliente deve cliccare 'Attiva notifiche' sul portale.",
      })
    }

    return NextResponse.json({ ok: true, inviati })
  } catch (err) {
    console.error('[FCM-ADMIN] errore push di prova:', err)
    return NextResponse.json({ error: 'Errore server' }, { status: 500 })
  }
}
