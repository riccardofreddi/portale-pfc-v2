/**
 * Portale PFC — Cloudflare R2 client (S3-compatible).
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { Readable } from 'stream'

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? ''
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? ''
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? ''
const R2_BUCKET = process.env.R2_BUCKET ?? ''
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

export const DOCS_PREFIX = 'Documenti'

export function haConfigurazioneR2(): boolean {
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET)
}

let _client: S3Client | null = null
function getClient(): S3Client {
  if (_client) return _client
  _client = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: false,
  })
  return _client
}

export interface R2Object {
  key: string
  size: number
  lastModified: Date | null
}

export async function listaOggetti(prefix: string): Promise<R2Object[]> {
  if (!haConfigurazioneR2()) return []
  const client = getClient()
  const out: R2Object[] = []
  let ContinuationToken: string | undefined
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: prefix,
        ContinuationToken,
      })
    )
    for (const obj of res.Contents ?? []) {
      if (!obj.Key) continue
      if (obj.Key.endsWith('/')) continue
      out.push({
        key: obj.Key,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified ? new Date(obj.LastModified) : null,
      })
    }
    ContinuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (ContinuationToken)
  return out
}

export async function caricaBytes(key: string): Promise<Buffer | null> {
  if (!haConfigurazioneR2()) return null
  const client = getClient()
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    if (!res.Body) return null
    const chunks: Buffer[] = []
    for await (const chunk of res.Body as Readable) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  } catch (err: unknown) {
    const e = err as { name?: string }
    if (e?.name === 'NoSuchKey' || e?.name === 'NotFound') return null
    console.error('[R2] caricaBytes errore:', key, err)
    return null
  }
}

export async function salvaBytes(key: string, content: Buffer | Uint8Array): Promise<void> {
  if (!haConfigurazioneR2()) {
    throw new Error('R2 non configurato.')
  }
  const client = getClient()
  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: content,
    })
  )
}

export async function eliminaOggetto(key: string): Promise<void> {
  if (!haConfigurazioneR2()) return
  const client = getClient()
  await client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
}

export async function eliminaPrefisso(prefix: string): Promise<number> {
  if (!haConfigurazioneR2()) return 0
  const objs = await listaOggetti(prefix)
  for (const o of objs) {
    await eliminaOggetto(o.key)
  }
  return objs.length
}

export async function oggettoEsiste(key: string): Promise<boolean> {
  if (!haConfigurazioneR2()) return false
  const client = getClient()
  try {
    await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    return true
  } catch {
    return false
  }
}

export function buildKey(username: string, anno: string, cartella: string, filename: string): string {
  return `${DOCS_PREFIX}/${username}/${anno}/${cartella}/${filename}`
}

export interface FileMeta {
  nome: string
  key: string
  size: number
  sizeStr: string
  lastModified: Date | null
}

export async function listFilesInCartella(
  username: string,
  anno: string,
  cartella: string
): Promise<FileMeta[]> {
  const prefix = `${DOCS_PREFIX}/${username}/${anno}/${cartella}/`
  const objs = await listaOggetti(prefix)
  return objs.map((o) => {
    const nome = o.key.slice(prefix.length)
    return {
      nome,
      key: o.key,
      size: o.size,
      sizeStr: formatBytesLocal(o.size),
      lastModified: o.lastModified,
    }
  })
}

export async function listAnniForCliente(username: string): Promise<string[]> {
  const prefix = `${DOCS_PREFIX}/${username}/`
  const objs = await listaOggetti(prefix)
  const anni = new Set<string>()
  for (const o of objs) {
    const rel = o.key.slice(prefix.length)
    const parts = rel.split('/')
    if (parts.length < 2) continue
    const anno = parts[0]
    if (!anno || anno.startsWith('_')) continue
    if (!/^\d{4}$/.test(anno)) continue
    anni.add(anno)
  }
  return Array.from(anni).sort((a, b) => b.localeCompare(a))
}

export async function listCartelleForAnno(username: string, anno: string): Promise<string[]> {
  const prefix = `${DOCS_PREFIX}/${username}/${anno}/`
  const objs = await listaOggetti(prefix)
  const cartelle = new Set<string>()
  for (const o of objs) {
    const rel = o.key.slice(prefix.length)
    const parts = rel.split('/')
    if (parts.length < 2) continue
    const cartella = parts[0]
    if (!cartella || cartella.startsWith('_')) continue
    cartelle.add(cartella)
  }
  return Array.from(cartelle).sort()
}

function formatBytesLocal(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const v = bytes / Math.pow(1024, i)
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/**
 * Cassetto Digitale - documenti anagrafici cliente.
 * Path: Documenti/{username}/_anagrafica/{filename}
 */
export const ANAGRAFICA_DIR = '_anagrafica'

export function buildCassettoKey(username: string, filename: string): string {
  return `${DOCS_PREFIX}/${username}/${ANAGRAFICA_DIR}/${filename}`
}

export async function listCassettoFiles(username: string): Promise<FileMeta[]> {
  const prefix = `${DOCS_PREFIX}/${username}/${ANAGRAFICA_DIR}/`
  const objs = await listaOggetti(prefix)
  return objs.map((o) => {
    const nome = o.key.slice(prefix.length)
    return {
      nome,
      key: o.key,
      size: o.size,
      sizeStr: formatBytesLocal(o.size),
      lastModified: o.lastModified,
    }
  })
}

/**
 * Pulisce i record DB orfani quando un file viene eliminato definitivamente.
 * Rimuove: file_views, file_downloads, favorites, notifications che puntano al filePath.
 * Da chiamare SEMPRE dopo eliminazione definitiva (cestino delete-permanent, cassetto delete).
 */
export async function purificaRiferimentiDB(filePath: string): Promise<void> {
  try {
    const { db } = await import('@/lib/db')
    await Promise.all([
      db.fileView.deleteMany({ where: { filePath } }).catch(() => {}),
      db.fileDownload.deleteMany({ where: { filePath } }).catch(() => {}),
      db.favorite.deleteMany({ where: { filePath } }).catch(() => {}),
      db.notification.deleteMany({ where: { detail: { contains: filePath } } }).catch(() => {}),
    ])
  } catch (err) {
    console.error('[purificaRiferimentiDB] errore:', err)
  }
}