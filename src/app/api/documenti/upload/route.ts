import { NextRequest, NextResponse } from 'next/server'
import { getSession, logAudit } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendPushToUser } from '@/lib/push'
import { notifyScadenzaImminente } from '@/lib/scadenza-notify'
import { salvaBytes, listaOggetti, eliminaOggetto, caricaBytes, buildKey, DOCS_PREFIX, haConfigurazioneR2 } from '@/lib/r2'
import { sanitizzaNomeFile, sanitizzaNomeCartella, MAX_FILE_SIZE_BYTES } from '@/lib/pfc-utils'

export const dynamic = 'force-dynamic'
// Budget per l'invio push inline: su Vercel limita la durata massima della funzione
// mentre la push viene consegnata. 60s = margine anche per upload multipli pesanti
// (file fino a 20MB ciascuno) + invio push in coda.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
  }
  if (!haConfigurazioneR2()) {
    return NextResponse.json({ error: 'R2 non configurato' }, { status: 500 })
  }

  try {
    const formData = await req.formData()
    const username = String(formData.get('username') ?? '').trim().toLowerCase()
    const anno = String(formData.get('anno') ?? '').trim()
    const cartellaRaw = String(formData.get('cartella') ?? '').trim().toUpperCase()
    const mode = (String(formData.get('mode') ?? 'rename') as 'rename' | 'versioning' | 'skip')

    if (!username || !anno || !cartellaRaw) {
      return NextResponse.json({ error: 'Parametri mancanti (username, anno, cartella)' }, { status: 400 })
    }
    if (!/^\d{4}$/.test(anno)) {
      return NextResponse.json({ error: 'Anno non valido (deve essere YYYY)' }, { status: 400 })
    }
    const cartella = sanitizzaNomeCartella(cartellaRaw)
    if (cartella.startsWith('_')) {
      return NextResponse.json({ error: 'Nome cartella non valido' }, { status: 400 })
    }

    const cliente = await db.user.findUnique({ where: { username } })
    if (!cliente) return NextResponse.json({ error: 'Cliente non trovato' }, { status: 404 })
    if (cliente.role === 'admin') {
      return NextResponse.json({ error: 'Non puoi caricare documenti per un admin' }, { status: 400 })
    }

    const files = formData.getAll('files').filter((f): f is File => f instanceof File)
    if (files.length === 0) {
      return NextResponse.json({ error: 'Nessun file ricevuto' }, { status: 400 })
    }

    // Scadenze per-file: mappa "nomeFile" -> { data, anticipo } (opzionale).
    // Permette all'admin di impostare una data di scadenza diversa per ciascun
    // documento caricato (es. vari F24 con date diverse).
    let scadenzeInput: Record<string, { data: string; anticipo?: number }> = {}
    try {
      const raw = String(formData.get('scadenze') ?? '').trim()
      if (raw) scadenzeInput = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'Formato scadenze non valido' }, { status: 400 })
    }

    const prefix = `${DOCS_PREFIX}/${username}/${anno}/${cartella}/`
    const existingObjs = await listaOggetti(prefix)
    const existingNames = new Set(existingObjs.map((o) => o.key.slice(prefix.length)))

    const results: { nome: string; key: string; size: number; status: 'caricato' | 'saltato' | 'rinominato' | 'sostituito' }[] = []

    // Un file appena scritto (nuovo, rinominato o versione sostituita sulla stessa
    // key) deve ripartire da stato "nuovo" per il cliente: i vecchi record di
    // anteprima/download della stessa key renderebbero il file "visto"/"scaricato"
    // all'istante e la cartella perderebbe il badge "+N".
    async function azzeraStatoFileLetto(key: string) {
      await Promise.all([
        db.fileView.deleteMany({ where: { filePath: key } }).catch(() => {}),
        db.fileDownload.deleteMany({ where: { filePath: key } }).catch(() => {}),
      ])
    }

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json({
          error: `File ${file.name} supera il limite di ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`,
        }, { status: 400 })
      }
      const nomePulito = sanitizzaNomeFile(file.name)
      const targetKey = buildKey(username, anno, cartella, nomePulito)

      if (existingNames.has(nomePulito)) {
        if (mode === 'skip') {
          results.push({ nome: nomePulito, key: targetKey, size: file.size, status: 'saltato' })
          continue
        }
        if (mode === 'rename') {
          const dotIdx = nomePulito.lastIndexOf('.')
          const ext = dotIdx >= 0 ? nomePulito.slice(dotIdx) : ''
          const base = dotIdx >= 0 ? nomePulito.slice(0, dotIdx) : nomePulito
          let counter = 2
          let newName = `${base}_v${counter}${ext}`
          while (existingNames.has(newName)) {
            counter++
            newName = `${base}_v${counter}${ext}`
          }
          const newKey = buildKey(username, anno, cartella, newName)
          const buf = Buffer.from(await file.arrayBuffer())
          await salvaBytes(newKey, buf)
          existingNames.add(newName)
          await db.uploadDate.upsert({ where: { filePath: newKey }, create: { filePath: newKey }, update: { ts: new Date() } })
          await azzeraStatoFileLetto(newKey)
          results.push({ nome: newName, key: newKey, size: file.size, status: 'rinominato' })
          continue
        }
        if (mode === 'versioning') {
          const trashKey = targetKey.replace(/^Documenti\//, 'Documenti/_cestino/')
          const oldData = await caricaBytes(targetKey)
          if (oldData) {
            await salvaBytes(trashKey, oldData)
          }
          await eliminaOggetto(targetKey)
          const buf = Buffer.from(await file.arrayBuffer())
          await salvaBytes(targetKey, buf)
          await db.uploadDate.upsert({ where: { filePath: targetKey }, create: { filePath: targetKey }, update: { ts: new Date() } })
          await azzeraStatoFileLetto(targetKey)
          results.push({ nome: nomePulito, key: targetKey, size: file.size, status: 'sostituito' })
          continue
        }
      }

      const buf = Buffer.from(await file.arrayBuffer())
      await salvaBytes(targetKey, buf)
      existingNames.add(nomePulito)
      await db.uploadDate.upsert({ where: { filePath: targetKey }, create: { filePath: targetKey }, update: { ts: new Date() } })
      await azzeraStatoFileLetto(targetKey)
      results.push({ nome: nomePulito, key: targetKey, size: file.size, status: 'caricato' })
    }

    // Crea le scadenze per i file appena caricati (se l'admin le ha indicate).
    // La mappa scadenzeInput è per nome file finale; matchiamo sui risultati.
    const nCaricati = results.filter(
      (r) => r.status === 'caricato' || r.status === 'rinominato' || r.status === 'sostituito'
    )
    let scadenzeNotificate = 0
    if (Object.keys(scadenzeInput).length > 0 && nCaricati.length > 0) {
      for (const r of nCaricati) {
        const spec = scadenzeInput[r.nome]
        if (!spec) continue
        const data = new Date(String(spec.data))
        if (isNaN(data.getTime())) continue
        const anticipo = Number.isFinite(Number(spec.anticipo)) ? Number(spec.anticipo) : 10
        const scadenza = await db.scadenza.upsert({
          where: { filePath: r.key },
          create: {
            filePath: r.key,
            userId: cliente.id,
            titolo: r.nome,
            dataScadenza: data,
            anticipoGiorni: anticipo,
            notificata: false,
          },
          update: {
            titolo: r.nome,
            dataScadenza: data,
            anticipoGiorni: anticipo,
            notificata: false,
          },
        })
        const { notified } = await notifyScadenzaImminente({
          scadenzaId: scadenza.id,
          userId: cliente.id,
          username,
          titolo: r.nome,
          filePath: r.key,
          dataScadenza: data,
          anticipoGiorni: anticipo,
          pagata: scadenza.pagata,
        })
        if (notified) scadenzeNotificate++
      }
    }

    let pushSent = 0
    if (nCaricati.length > 0) {
      await db.notification.create({
        data: {
          userId: cliente.id,
          type: 'documento_nuovo',
          text: `Nuovi documenti caricati in ${cartella}/${anno}`,
          detail: `${results.length} file`,
          year: anno,
          folder: cartella,
        },
      })

      // Notifica push: il Service Worker mostra SEMPRE la notifica di sistema
      // (race-safe, anche a pagina chiusa/in background). Quando la pagina è
      // aperta e visibile, il client mostra inoltre un toast in-app + suono.
      // Il click sulla notifica apre l'Archivio sulla cartella esatta (?anno=&cartella=).
      // Invio inline PRIMA della risposta: su Vercel una promise non attesa muore
      // con la funzione, quindi l'invio va completato nell'arco di vita dell'handler.
      pushSent = await sendPushToUser(username, {
        title: 'Nuovo documento disponibile',
        body: `Nuovi documenti caricati in ${cartella}/${anno}`,
        url: `/?tab=archivio&anno=${encodeURIComponent(anno)}&cartella=${encodeURIComponent(cartella)}`,
        tag: 'pfc-documento',
      }).catch((e) => {
        console.error('[PUSH] documenti errore:', e)
        return 0
      })
    }

    await logAudit(session.sub, 'UPLOAD_DOC', `${username}/${anno}/${cartella} (${results.length} file)`)
    return NextResponse.json({ ok: true, results, pushSent, scadenzeNotificate })
  } catch (err) {
    console.error('[upload] errore:', err)
    return NextResponse.json({ error: `Errore upload: ${String(err)}` }, { status: 500 })
  }
}
