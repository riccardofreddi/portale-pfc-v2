/**
 * POST /api/push/verifica
 *   body: { endpoint }
 *   - v4.56: dice al browser se il server ha ANCORA la sua iscrizione push.
 *
 *   PERCHE' SERVE: il bottone della barra superiore decide tra "Attiva
 *   notifiche" e "Prova notifica" guardando SOLO lo stato LOCALE del browser
 *   (abbonamento + chiave salvata). Se la riga sul server manca (pulizia,
 *   rotazione chiavi, ripristino database), il browser si credeva attivo,
 *   mostrava "Prova notifica" e gli avvisi non arrivavano MAI, in silenzio.
 *   Ora all'avvio il browser chiede: "il mio indirizzo e' ancora a libro?".
 *   Se no, il bottone torna "Attiva notifiche" e un click risistema tutto.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const endpoint: string | undefined = body?.endpoint
    if (!endpoint || typeof endpoint !== 'string') {
      return NextResponse.json({ ok: false, registrata: false })
    }

    const user = await db.user.findUnique({
      where: { username: session.sub },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ ok: true, registrata: false })
    }

    const conteggio = await db.pushSubscription.count({
      where: { userId: user.id, endpoint },
    })

    return NextResponse.json({ ok: true, registrata: conteggio > 0 })
  } catch (err) {
    console.error('[PUSH verifica] errore:', err)
    // In caso di errore NON dichiariamo "registrata": meglio far riattivare
    // (operazione sicura e idempotente) che fingere che tutto vada bene.
    return NextResponse.json({ ok: false, registrata: false })
  }
}
