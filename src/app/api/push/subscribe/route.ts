/**
 * POST /api/push/subscribe
 *   body: { endpoint, keys: { p256dh, auth }, vecchiEndpoints?: string[] }
 *   - Registra (o aggiorna) una sottoscrizione push per l'utente loggato.
 *   - v4.56: il browser puo' allegare GLI INDIRIZZI VECCHI di se stesso
 *     (l'endpoint che sta sostituendo in questa attivazione). Il server li
 *     cancella nell STESSA richiesta: una sola operazione, niente finestre
 *     in cui la pulizia puo' fallire in silenzio (era il buco del fix v4.54,
 *     che mandava la cancellazione con una chiamata separata "best effort").
 *
 *   PERCHE' NON UNA REGOLA AUTOMATICA PER TIPO DI BROWSER (idea v4.55,
 *   RITIRATA): il titolare usa Edge su DUE computer diversi (casa e studio)
 *   con lo stesso account. Una regola "stesso servizio = tieni solo l'ultimo"
 *   farebbe SPEGNERE le notifiche di casa ogni volta che si riattivano in
 *   studio, e viceversa. I due computer sono entrambi LEGITTIMI: restano.
 *   La pulizia avviene SOLO quando e' lo stesso browser a dichiarare il
 *   proprio vecchio indirizzo (che e' l'unico caso davvero doppio).
 *
 * DELETE /api/push/subscribe
 *   body: { endpoint }
 *   - Rimuove la sottoscrizione (utente che si disiscrive o logout).
 *
 *   v4.57 - GUARDIA ANTI-INDIRIZZO-TEMPORANEO: dopo ogni redeploy il pannello
 *   Vercel mostra un link del tipo "portale-pfc-v2-abc12345-....vercel.app"
 *   (indirizzo TEMPORANEO, cambia a ogni aggiornamento). Se il portale viene
 *   aperto da li' e si attivano le notifiche, la riga finisce a libro con
 *   quell'etichetta lunghissima (il "token strano" visto nella notifica) e
 *   muore al deploy successivo. Da oggi il server RIFIUTA queste iscrizioni:
 *   le notifiche si attivano SOLO dall'indirizzo ufficiale.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// v4.57: l'indirizzo ufficiale e' UNO. Sono accettate anche le prove in
// locale sul computer (localhost / 127.0.0.1) per gli sviluppi futuri.
const INDIRIZZO_UFFICIALE = 'portale-pfc-v2.vercel.app'

function origineConsentita(origin: string | null): boolean {
  // Nessun header Origin = chi chiama non e' una pagina web (es. script di
  // controllo): non abbiamo modo di giudicare, lasciamo passare.
  if (!origin) return true
  try {
    const host = new URL(origin).hostname
    return host === INDIRIZZO_UFFICIALE || host === 'localhost' || host === '127.0.0.1'
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  try {
    // v4.57: niente iscrizioni da indirizzi temporanei (vedi commento in testa).
    const origin = req.headers.get('origin')
    if (!origineConsentita(origin)) {
      console.warn(`[PUSH subscribe] rifiutata iscrizione da origine non ufficiale: ${origin}`)
      return NextResponse.json(
        {
          error:
            `Indirizzo non ufficiale. Apri il portale su https://${INDIRIZZO_UFFICIALE} ` +
            `e attiva le notifiche da li'.`,
        },
        { status: 403 }
      )
    }

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

    // v4.56: sostituzione ATOMICA del vecchio indirizzo dello stesso browser.
    // Il client allega gli indirizzi vecchi che conosce (abbonamento appena
    // disdetto + indirizzo salvato in locale). Cancelliamo SOLO righe di
    // QUESTO utente e SOLO indirizzi diversi da quello nuovo: i computer
    // diversi (casa/studio) non dichiarano i loro indirizzi qui, quindi
    // non vengono mai toccati.
    try {
      const candidati: string[] = Array.isArray(body?.vecchiEndpoints) ? body.vecchiEndpoints : []
      const vecchi = [
        ...new Set(
          candidati.filter(
            (e): e is string =>
              typeof e === 'string' && e.length > 0 && e.length <= 2000 && e !== endpoint
          )
        ),
      ].slice(0, 5)

      if (vecchi.length > 0) {
        const esito = await db.pushSubscription.deleteMany({
          where: { userId: user.id, endpoint: { in: vecchi } },
        })
        if (esito.count > 0) {
          console.log(
            `[PUSH subscribe] v4.56: stesso browser sostituisce il vecchio indirizzo: rimosse ${esito.count} righe vecchie`
          )
        }
      }
    } catch (dedupErr) {
      // La pulizia non deve MAI bloccare l'iscrizione: se fallisce, log e avanti.
      console.error('[PUSH subscribe] pulizia vecchi indirizzi (non bloccante):', dedupErr)
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
