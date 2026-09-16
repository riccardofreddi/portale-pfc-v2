import { NextRequest, NextResponse } from 'next/server'
import { getSession, logAudit } from '@/lib/auth'
import { db } from '@/lib/db'
import { salvaBytes, listaOggetti, DOCS_PREFIX, haConfigurazioneR2 } from '@/lib/r2'
import { sanitizzaNomeFile, MAX_FILE_SIZE_BYTES, DEFAULT_ADMIN_USER } from '@/lib/pfc-utils'
import { sendPushToUser } from '@/lib/push'

export const dynamic = 'force-dynamic'
// Budget per l'invio push inline verso lo studio (stesso schema di /api/messaggi).
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'client') {
    return NextResponse.json({ error: 'Solo i clienti possono caricare risposte' }, { status: 403 })
  }
  if (!haConfigurazioneR2()) {
    return NextResponse.json({ error: 'R2 non configurato' }, { status: 500 })
  }

  try {
    const formData = await req.formData()
    const msgId = String(formData.get('msgId') ?? '').trim()
    const file = formData.getAll('file').filter((f): f is File => f instanceof File)[0]

    if (!msgId) return NextResponse.json({ error: 'ID messaggio mancante' }, { status: 400 })
    if (!file) return NextResponse.json({ error: 'File mancante' }, { status: 400 })

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: `File troppo grande (max ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB)` }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { username: session.sub } })
    if (!user) return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 })

    const msg = await db.message.findUnique({ where: { id: msgId } })
    if (!msg || msg.userId !== user.id) {
      return NextResponse.json({ error: 'Messaggio non trovato' }, { status: 404 })
    }
    if (!msg.requiresUpload) {
      return NextResponse.json({ error: 'Questo messaggio non richiede un file' }, { status: 400 })
    }

    const nomePulito = sanitizzaNomeFile(file.name)

    const prefix = `${DOCS_PREFIX}/${session.sub}/_risposte/${msgId}/`
    const existing = await listaOggetti(prefix)
    const existingNames = new Set(existing.map((o) => o.key.slice(prefix.length)))

    let finalName = nomePulito
    if (existingNames.has(nomePulito)) {
      const dotIdx = nomePulito.lastIndexOf('.')
      const ext = dotIdx >= 0 ? nomePulito.slice(dotIdx) : ''
      const base = dotIdx >= 0 ? nomePulito.slice(0, dotIdx) : nomePulito
      let counter = 1
      while (existingNames.has(`${base}_${counter}${ext}`)) {
        counter++
      }
      finalName = `${base}_${counter}${ext}`
    }

    const key = `${DOCS_PREFIX}/${session.sub}/_risposte/${msgId}/${finalName}`
    const buf = Buffer.from(await file.arrayBuffer())
    await salvaBytes(key, buf)

    await db.message.update({
      where: { id: msgId },
      data: { uploadReceived: true },
    })

    // Squillo per lo studio: il cliente ha risposto al messaggio con un file.
    // Tutto in try/catch: un problema di push NON deve mai far fallire il
    // caricamento del documento (l'azione del cliente e' la parte critica).
    try {
      await sendPushToUser(DEFAULT_ADMIN_USER, {
        title: 'Risposta dal cliente',
        body: `${user.name}: ha risposto al tuo messaggio con "${finalName}"`.slice(0, 100),
        url: '/?tab=risposte',
        tag: 'pfc-risposta-cliente',
      })
    } catch (pushErr) {
      console.error('[risposte/upload] push admin (ignorata):', pushErr)
    }

    await logAudit(session.sub, 'UPLOAD_RISPOSTA', `${finalName} (msg: ${msgId})`)
    return NextResponse.json({ ok: true, key, nome: finalName })
  } catch (err) {
    console.error('[risposte/upload] errore:', err)
    return NextResponse.json({ error: `Errore: ${String(err)}` }, { status: 500 })
  }
}
