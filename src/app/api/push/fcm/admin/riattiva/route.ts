/**
 * POST /api/push/fcm/admin/riattiva
 *   (solo ADMIN) body: { username }
 *
 *   Il cliente risulta "0 telefoni" nel Resoconto? Il server NON PUO'
 *   richiamare un telefono di cui non ha piu' l'indirizzo (token FCM):
 *   e' come voler spedire una lettera senza scrivere l'indirizzo.
 *   L'UNICA riparazione vera e' che il telefono riparta lui: basta che il
 *   cliente apra l'app per 10 secondi e la auto-riparazione (v4.51) si
 *   ricollega da sola, senza toccare nessuna impostazione.
 *
 *   Questo bottone fa l'unica cosa che il server PUO' fare da lontano:
 *   manda una EMAIL di cortesia al cliente che gli spiega esattamente
 *   questo passaggio. Se il cliente non ha un'email (o la posta non e'
 *   configurata), risponde con il messaggio da dire a voce al telefono.
 *
 *   MODULO ADDITIVO: non tocca token, dati, ne' altri endpoint.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendEmail, isSmtpConfigured } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
      select: { id: true, username: true, role: true, name: true, email: true },
    })
    if (!user || user.role !== 'client') {
      return NextResponse.json({ error: 'Cliente non trovato' }, { status: 404 })
    }

    const email = user.email?.trim() || null

    if (!email) {
      return NextResponse.json({
        ok: false,
        msg: `${user.name} non ha un'email sul portale: chiamalo e digli di aprire l'app per 10 secondi. Il telefono si ricollega da solo.`,
      })
    }

    if (!isSmtpConfigured()) {
      return NextResponse.json({
        ok: false,
        msg: `La posta non è configurata sul server: chiama ${user.name} e digli di aprire l'app per 10 secondi. Si ricollega da solo.`,
      })
    }

    const inviata = await sendEmail({
      to: email,
      subject: 'Portale PFC — attivare di nuovo le notifiche (basta 10 secondi)',
      text: [
        `Gentile ${user.name},`,
        '',
        'per ricevere di nuovo le notifiche del Portale PFC basta un passaggio:',
        'apra l\'app Portale PFC sul telefono e la lasci aperta per 10 secondi.',
        '',
        'Il telefono si ricollega da solo: non serve toccare nessuna impostazione.',
        'Se l\'app era già aperta, chiudala e riapra: l\'effetto è lo stesso.',
        '',
        'Grazie',
      ].join('\n'),
      html: [
        `<p>Gentile <strong>${user.name}</strong>,</p>`,
        '<p>per ricevere di nuovo le notifiche del Portale PFC basta un passaggio:</p>',
        '<p style="font-size:15px"><strong>apra l\'app Portale PFC sul telefono e la lasci aperta per 10 secondi.</strong></p>',
        '<p>Il telefono si ricollega da solo: non serve toccare nessuna impostazione.<br/>Se l\'app era già aperta, chiudala e riapra: l\'effetto è lo stesso.</p>',
        '<p>Grazie</p>',
      ].join('<br/>'),
    })

    if (!inviata) {
      return NextResponse.json({
        ok: false,
        msg: `Invio email fallito: chiama ${user.name} e digli di aprire l'app per 10 secondi. Si ricollega da solo.`,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[FCM-RIATTIVA] errore:', err)
    return NextResponse.json({ error: 'Errore server' }, { status: 500 })
  }
}
