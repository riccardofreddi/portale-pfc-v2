import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { caricaBytes, haConfigurazioneR2, DOCS_PREFIX } from '@/lib/r2'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  if (!haConfigurazioneR2()) {
    return NextResponse.json({ error: 'R2 non configurato' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key') ?? ''
  const page = parseInt(searchParams.get('page') ?? '1', 10)

  if (!key || !key.startsWith(`${DOCS_PREFIX}/`)) {
    return NextResponse.json({ error: 'Path non valido' }, { status: 400 })
  }

  if (session.role === 'client') {
    const expectedPrefix = `${DOCS_PREFIX}/${session.sub}/`
    if (!key.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 403 })
    }
  }

  const data = await caricaBytes(key)
  if (!data) return NextResponse.json({ error: 'File non trovato' }, { status: 404 })

  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const { createCanvas } = await import('@napi-rs/canvas')

    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) })
    const pdf = await loadingTask.promise
    const totalPages = pdf.numPages

    if (page < 1 || page > totalPages) {
      return NextResponse.json({ error: 'Pagina non valida' }, { status: 400 })
    }

    const pdfPage = await pdf.getPage(page)
    const viewport = pdfPage.getViewport({ scale: 2 })
    const canvas = createCanvas(viewport.width, viewport.height)
    const context: any = (canvas as any).getContext('2d')

    // Aggiungi il canvas al context come richiesto da pdfjs-dist 5.x
    (context as any).canvas = canvas

    await pdfPage.render({
      canvasContext: context as any,
      viewport,
    } as any).promise

    const pngBuffer = canvas.toBuffer('image/png')
    await pdf.destroy()

    return new NextResponse(pngBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, no-cache',
        'X-Total-Pages': String(totalPages),
      },
    })
  } catch (err) {
    console.error('[pdf-page] errore:', err)
    return NextResponse.json({ error: `Errore rendering: ${String(err)}` }, { status: 500 })
  }
}
