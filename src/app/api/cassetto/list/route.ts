import { NextRequest, NextResponse } from 'next/server'
import { getSession, logAudit } from '@/lib/auth'
import { listCassettoFiles, haConfigurazioneR2, DOCS_PREFIX } from '@/lib/r2'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 })

  if (!haConfigurazioneR2()) {
    return NextResponse.json({ error: 'R2 non configurato' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  let username = searchParams.get('username') ?? session.sub
  if (session.role === 'client') username = session.sub

  try {
    const files = await listCassettoFiles(username)

    // v4.53: per ogni file esponi il tipo riconosciuto dal PREFISSO della
    // chiave ({tipoKey}_{anno}_{nome}.{ext}); null se non riconoscibile (file
    // rinominati prima di questa versione). Serve ad app e web per la regola
    // "uno slot per tipo": i tipi gia' presenti si mostrano occupati.
    const TIPI_CASSETTO = ['qr_code_p_iva', 'certificato_p_iva', 'visura_camerale', 'doc_identita', 'iban', 'altro']
    const riconosciTipo = (key: string): string | null => {
      const nome = key.split('/').pop() ?? ''
      return TIPI_CASSETTO.find((t) => nome.startsWith(`${t}_`)) ?? null
    }
    const filesConTipo = files.map((f) => ({ ...f, tipoKey: riconosciTipo(f.key) }))

    return NextResponse.json({ files: filesConTipo })
  } catch (err) {
    console.error('[cassetto/list] errore:', err)
    return NextResponse.json({ error: `Errore: ${String(err)}` }, { status: 500 })
  }
}
