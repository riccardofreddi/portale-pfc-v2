/**
 * Invio email di fallback via SMTP (casa dello studio, es. Libero).
 *
 * Usato SOLO come fallback della Web Push per i promemoria di scadenza:
 * se la push non viene consegnata (cliente senza subscription / offline /
 * token scaduto) e il cliente ha un'email, gli mandiamo una mail di cortesia.
 *
 * Configurazione (solo su Vercel, mai nel codice):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * Se la config manca, sendEmail ritorna false in silenzio: il resto
 * dell'app continua a funzionare (campanella + push restano attivi).
 */
import nodemailer from 'nodemailer'

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

let transporter: nodemailer.Transporter | null = null
function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 465
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 465 = SSL/TLS implicito; 587 = STARTTLS (secure:false)
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  }
  return transporter
}

export async function sendEmail(opts: {
  to: string
  subject: string
  text: string
  html?: string
}): Promise<boolean> {
  if (!isSmtpConfigured()) {
    console.warn('[EMAIL] SMTP non configurato: skip invio a', opts.to)
    return false
  }
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    })
    return true
  } catch (err) {
    console.error('[EMAIL] invio fallito a', opts.to, '-', err)
    return false
  }
}
