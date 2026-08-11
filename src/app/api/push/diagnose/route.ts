import { NextResponse } from 'next/server'
import webpush from 'web-push'
import https from 'node:https'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const debug: any = { steps: [] }

  try {
    // Step 1: verifica env vars
    const publicKey = process.env.VAPID_PUBLIC_KEY
    const privateKey = process.env.VAPID_PRIVATE_KEY
    const subject = process.env.VAPID_SUBJECT
    const nextPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

    debug.envVars = {
      VAPID_PUBLIC_KEY: publicKey ? { length: publicKey.length, first10: publicKey.substring(0, 10), last10: publicKey.substring(publicKey.length - 10) } : 'MISSING',
      VAPID_PRIVATE_KEY: privateKey ? { length: privateKey.length, first10: privateKey.substring(0, 10), last10: privateKey.substring(privateKey.length - 10) } : 'MISSING',
      VAPID_SUBJECT: subject || 'MISSING',
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: nextPublicKey ? { length: nextPublicKey.length, first10: nextPublicKey.substring(0, 10) } : 'MISSING',
    }

    // Step 2: verifica match tra public e NEXT_PUBLIC
    debug.keysMatch = publicKey === nextPublicKey

    // Step 3: prova a configurare web-push
    try {
      webpush.setVapidDetails(subject || 'mailto:admin@portalepfc.it', publicKey!, privateKey!)
      debug.webpushConfigured = true
    } catch (err) {
      debug.webpushConfigured = false
      debug.webpushConfigError = String(err)
    }

    // Step 4: genera un JWT di test e verifica
    try {
      // Crea una subscription fittizia per testare
      const testSub = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test',
        keys: {
          p256dh: 'BNNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          auth: 'aaaaaaaaaaaaaaaaaaaaaa',
        },
      }
      
      // Prova a generare solo il JWT VAPID (senza inviare)
      // web-push non espone questo direttamente, ma proviamo sendNotification su un endpoint fittizio
      const result = await webpush.sendNotification(testSub, JSON.stringify({ title: 'test' }), {
        TTL: 60,
        // Stesso approccio di src/lib/push.ts: agent senza keep-alive per evitare
        // il riuso di socket morti sul serverless (causa dei socket hang up).
        agent: new https.Agent({ keepAlive: false }),
      })
      debug.testSendSuccess = true
    } catch (err: any) {
      // L'errore qui è OK perché l'endpoint è fittizio, ma se l'errore è "VAPID signature" allora le chiavi non matchano
      debug.testSendError = {
        statusCode: err?.statusCode,
        message: err?.message,
        body: typeof err?.body === 'string' ? err.body.substring(0, 200) : JSON.stringify(err?.body)?.substring(0, 200),
      }
    }

    debug.ok = true
    return NextResponse.json(debug)
  } catch (err) {
    debug.error = String(err)
    debug.stack = (err as Error)?.stack
    return NextResponse.json(debug, { status: 500 })
  }
}
