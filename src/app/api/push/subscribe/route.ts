/**
 * POST /api/push/subscribe
 *   body: { endpoint, keys: { p256dh, auth } }
 *   - Registra (o aggiorna) una sottoscrizione push per l'utente loggato.
 *   - v4.55 (anti-doppione per FAMIGLIA): dopo la registrazione cancella le
 *     iscrizioni VECCHIE dello stesso utente sullo STESSO servizio di push
 *     (stessa "famiglia", vedi famigliaPush). Serve perche' alcuni browser
 *     (Edge/Windows fra tutti) presentano un INDIRIZZO NUOVO a ogni
 *     riattivazione: se il server tenesse anche i vecchi, ogni avviso
 *     arriverebbe DUE/TRE volte sullo stesso schermo. Famiglie DIVERSE
 *     (es. Edge del PC e Chrome di un altro PC) restano tutte: sono
 *     schermi diversi e devono continuare a ricevere gli avvisi.
 *
 * DELETE /api/push/subscribe
 *   body: { endpoint }
 *   - Rimuove la sottoscrizione (utente che si disiscrive o logout).
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * v4.55: riconosce la FAMIGLIA di push service dall'endpoint. Basta il
 * suffisso dell'host perche' i servizi usano host regionali diversi
 * (es. wns2-db5p.notify.windows.com vs wns2-by2.notify.windows.com):
 * stesso suffisso = stesso servizio = solitamente lo stesso schermo che
 * si e' ri-iscritto con un indirizzo nuovo.
 */
function famigliaPush(endpoint: string): string | null {
  try {
    const host = new URL(endpoint).host
    if (host.endsWith('notify.windows.com')) return 'wns' // Edge / Windows
    if (host.endsWith('fcm.googleapis.com')) return 'fcm-web' // Chrome (PC e Android)
    if (host.endsWith('push.services.mozilla.com')) return 'mozilla' // Firefox
    if (host.endsWith('push.apple.com')) return 'apns' // Safari
    return host
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
    }

    const body = await req.json()
    const endpoint: string | undefined = body?.endpoint
    const p256dh: string | undefined = body?.keys?.p256dh
    const auth: string | undefined = body?.keys?.auth

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: 'Payload non valido. Richiesti: endpoint, keys.p256dh, keys.auth' },
        { status: 400 }
      )
    }

    const user = await db.user.findUnique({
      where: { username: session.sub },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })
    }

    // Upsert: se l'endpoint esiste già (magari di un altro utente che ha fatto logout
    // sullo stesso device), lo leghiamo all'utente corrente.
    await db.pushSubscription.upsert({
      where: { endpoint },
      create: {
        endpoint,
        p256dh,
        auth,
        userId: user.id,
      },
      update: {
        p256dh,
        auth,
        userId: user.id,
      },
    })

    // v4.55 (anti-doppione per FAMIGLIA): teniamo solo l'indirizzo piu' recente
    // per lo stesso servizio di push. Senza questa cura il server resta con
    // piu' righe vive dello stesso schermo (Edge rigenera l'indirizzo a ogni
    // attivazione) e OGNI avviso parte in piu' copie.
    // Nota: NON tocchiamo le famiglie diverse (altri browser/PC legittimi) e
    // NON tocchiamo i token FCM dell'app (tabella a parte, un telefono = 1 token).
    try {
      const famiglia = famigliaPush(endpoint)
      if (famiglia) {
        const altre = await db.pushSubscription.findMany({
          where: { userId: user.id, endpoint: { not: endpoint } },
          select: { endpoint: true },
        })
        const vecchieStessaFamiglia = altre
          .filter((r) => famigliaPush(r.endpoint) === famiglia)
          .map((r) => r.endpoint)
        if (vecchieStessaFamiglia.length > 0) {
          await db.pushSubscription.deleteMany({
            where: { endpoint: { in: vecchieStessaFamiglia } },
          })
          console.log(
            `[PUSH subscribe] anti-doppione famiglia ${famiglia}: rimosse ${vecchieStessaFamiglia.length} iscrizioni vecchie dello stesso utente`
          )
        }
      }
    } catch (dedupErr) {
      // La pulizia non deve MAI bloccare l'iscrizione: se fallisce, log e avanti.
      console.error('[PUSH subscribe] anti-doppione famiglia (non bloccante):', dedupErr)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[PUSH subscribe] errore:', err)
    return NextResponse.json({ error: 'Errore server' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const endpoint: string | undefined = body?.endpoint

    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint obbligatorio' }, { status: 400 })
    }

    await db.pushSubscription.deleteMany({
      where: { endpoint },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[PUSH unsubscribe] errore:', err)
    return NextResponse.json({ error: 'Errore server' }, { status: 500 })
  }
}
