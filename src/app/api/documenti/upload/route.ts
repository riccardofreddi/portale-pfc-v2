import { NextRequest, NextResponse } from 'next/server'
import { getSession, logAudit } from '@/lib/auth'
import { db } from '@/lib/db'
import { salvaBytes, listaOggetti, eliminaOggetto, caricaBytes, buildKey, DOCS_PREFIX, haConfigurazioneR2 } from '@/lib/r2'
import { sanitizzaNomeFile, sanitizzaNomeCartella, MAX_FILE_SIZE_BYTES } from '@/lib/pfc-utils'

export const dynamic = 'force-dynamic'

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

    const prefix = `${DOCS_PREFIX}/${username}/${anno}/${cartella}/`
    const existingObjs = await listaOggetti(prefix)
    const existingNames = new Set(existingObjs.map((o) => o.key.slice(prefix.length)))

    const results: { nome: string; key: string; size: number; status: 'caricato' | 'saltato' | 'rinominato' | 'sostituito' }[] = []

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
          results.push({ nome: nomePulito, key: targetKey, size: file.size, status: 'sostituito' })
          continue
        }
      }

      const buf = Buffer.from(await file.arrayBuffer())
      await salvaBytes(targetKey, buf)
      existingNames.add(nomePulito)
      await db.uploadDate.upsert({ where: { filePath: targetKey }, create: { filePath: targetKey }, update: { ts: new Date() } })
      results.push({ nome: nomePulito, key: targetKey, size: file.size, status: 'caricato' })
    }

    if (results.some((r) => r.status === 'caricato' || r.status === 'rinominato' || r.status === 'sostituito')) {
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
    }

    await `)
    return NextResponse.json({ ok: true, results })
  } catch (err) {
    console.error('[upload] errore:', err)
    return NextResponse.json({ error: `Errore upload: ${String(err)}` }, { status: 500 })
  }
}
