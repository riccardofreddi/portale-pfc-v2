/**
 * GET /api/push/fcm/stato
 *   Risponde a chi è loggato con QUANTI telefoni sono registrati per le
 *   notifiche FCM (tabella fcm_tokens) e quando l'ultimo ha salutato.
 *
 *   Serve all'app nativa (v4.52+) per la riga di controllo in Impostazioni
 *   "Sul server: N telefoni collegati" e per l'auto-riparazione: se la
 *   risposta è 0 telefoni, l'app richiama da sola POST /api/push/fcm
 *   (registrazione che esiste già) senza far premere nulla al cliente.
 *
 * MODULO ADDITIVO: SOLO LETTURA — non crea, modifica né cancella dati.
 * Non interferisce con /api/push/test (Web Push v2) né con /api/push/fcm.
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { isFcmEnabled } from '@/lib/fcm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { username: session.sub },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
    }

    const telefoni = await db.fcmToken.count({ where: { userId: user.id } })
    const ultimo = await db.fcmToken.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true, device: true },
    })

    return NextResponse.json({
      telefoni,
      ultimoAggiornamento: ultimo?.updatedAt ?? null,
      dispositivo: ultimo?.device ?? null,
      fcmAttivo: isFcmEnabled(),
    })
  } catch (err) {
    console.error('[FCM-STATO] errore:', err)
    return NextResponse.json({ error: 'Errore server' }, { status: 500 })
  }
}
