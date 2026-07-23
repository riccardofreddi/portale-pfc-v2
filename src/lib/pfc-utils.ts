/**
 * Utility condivise — Portale PFC.
 */

import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'

export const MAX_FILE_SIZE_MB = 20
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
export const DEFAULT_ADMIN_USER = 'admin'
export const PAGE_SIZE = 10

export function sanitizzaNomeFile(filename: string, fallback = 'documento'): string {
  let nome = (filename ?? '').replace(/\\/g, '/').split('/').pop() ?? ''
  nome = nome.replace(/[\x00-\x1f\x7f]/g, '').trim()
  nome = nome.replace(/[<>:"/\\|?*]+/g, '_')
  nome = nome.replace(/^[.\s]+|[.\s]+$/g, '')
  if (!nome || nome === '.' || nome === '..') return fallback
  if (nome.length > 240) {
    const dotIdx = nome.lastIndexOf('.')
    const ext = dotIdx >= 0 ? nome.slice(dotIdx) : ''
    const base = dotIdx >= 0 ? nome.slice(0, dotIdx) : nome
    nome = base.slice(0, 240 - ext.length) + ext
  }
  return nome
}

export function sanitizzaNomeCartella(nome: string, fallback = 'CARTELLA'): string {
  let pulito = (nome ?? '').replace(/\\/g, '/').split('/').pop() ?? ''
  pulito = pulito.replace(/[\x00-\x1f\x7f]/g, '').trim()
  pulito = pulito.replace(/[<>:"/\\|?*]+/g, '_')
  pulito = pulito.replace(/^[.\s]+|[.\s]+$/g, '')
  if (!pulito || pulito === '.' || pulito === '..') return fallback
  if (pulito.length > 240) pulito = pulito.slice(0, 240)
  return pulito
}

const SUPPORTED_EXTENSIONS: Record<string, { icon: string; class: string; bg: string; fg: string }> = {
  pdf:  { icon: 'PDF', class: 'file-pdf',   bg: '#fde8e8', fg: '#c62828' },
  jpg:  { icon: 'IMG', class: 'file-img',   bg: '#ede7f6', fg: '#6a1b9a' },
  jpeg: { icon: 'IMG', class: 'file-img',   bg: '#ede7f6', fg: '#6a1b9a' },
  png:  { icon: 'IMG', class: 'file-img',   bg: '#ede7f6', fg: '#6a1b9a' },
  svg:  { icon: 'IMG', class: 'file-img',   bg: '#ede7f6', fg: '#6a1b9a' },
  doc:  { icon: 'DOC', class: 'file-word',   bg: '#e3f2fd', fg: '#1565c0' },
  docx: { icon: 'DOC', class: 'file-word',   bg: '#e3f2fd', fg: '#1565c0' },
  odt:  { icon: 'DOC', class: 'file-word',   bg: '#e3f2fd', fg: '#1565c0' },
  xls:  { icon: 'XLS', class: 'file-xls',    bg: '#e8f5e9', fg: '#2e7d32' },
  xlsx: { icon: 'XLS', class: 'file-xls',    bg: '#e8f5e9', fg: '#2e7d32' },
  csv:  { icon: 'CSV', class: 'file-csv',    bg: '#e8f5e9', fg: '#2e7d32' },
  txt:  { icon: 'TXT', class: 'file-txt',    bg: '#f5f5f5', fg: '#616161' },
  zip:  { icon: 'ZIP', class: 'file-zip',    bg: '#fff3e0', fg: '#e65100' },
  rar:  { icon: 'RAR', class: 'file-zip',    bg: '#fff3e0', fg: '#e65100' },
}

const DEFAULT_ICON = { icon: 'FILE', class: 'file-unknown', bg: '#f5f5f5', fg: '#616161' }

export function ottieniIconaFile(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return SUPPORTED_EXTENSIONS[ext] ?? DEFAULT_ICON
}

export function canPreviewFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return ['pdf', 'jpg', 'jpeg', 'png'].includes(ext)
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const v = bytes / Math.pow(1024, i)
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatDate(d: Date | string | number): string {
  const date = typeof d === 'string' ? parseISO(d) : new Date(d)
  if (isNaN(date.getTime())) return '—'
  return format(date, 'd MMM yyyy, HH:mm', { locale: it })
}

export function formatDateShort(d: Date | string | number): string {
  const date = typeof d === 'string' ? parseISO(d) : new Date(d)
  if (isNaN(date.getTime())) return '—'
  return format(date, 'd MMM yyyy', { locale: it })
}

export function formatDateAudit(ts: string): string {
  try {
    const date = ts.includes('T') ? parseISO(ts) : parseISO(ts.replace(' ', 'T'))
    if (isNaN(date.getTime())) return ts
    return format(date, 'd MMM yyyy, HH:mm', { locale: it })
  } catch {
    return ts
  }
}

export function getInitials(name: string): string {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}
