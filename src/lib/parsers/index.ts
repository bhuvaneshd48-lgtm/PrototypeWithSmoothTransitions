import type { ChatMessage, ParseResult } from '@/types'

export const LIMITS = {
  maxFileBytes: 8 * 1024 * 1024,
  /** Messages sent to Gemini in one analysis. Larger chats require choosing a range. */
  maxMessages: 1500,
  /** Prepared characters sent to Gemini in one analysis. */
  maxChars: 400_000,
}

export class ImportError extends Error {}

export function normalizeText(raw: string): string {
  return raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}

function withIds(rows: Array<Omit<ChatMessage, 'id' | 'sourceIndex'>>): ChatMessage[] {
  return rows
    .map((r) => ({ ...r, text: r.text.trim() }))
    .filter((r) => r.text.length > 0)
    .map((r, i) => ({ id: `m${i + 1}`, sourceIndex: i, ...r }))
}

// WhatsApp: "12/03/2024, 14:05 - Name: text" (Android) or "[12/03/2024, 14:05:33] Name: text" (iOS)
const WA_LINE =
  /^[\u200e\u200f]*\[?(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{2,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?[\s\u202f]*([AaPp]\.?\s?[Mm]\.?)?\]?\s*(?:[-\u2013]\s*)?(.*)$/
const WA_SENDER = /^[\u200e\u200f]*([^:\n]{1,80}?):\s?([\s\S]*)$/

type WaHead = { a: number; b: number; y: number; h: number; min: number; ampm: string | null; rest: string }

function matchWa(line: string): WaHead | null {
  const m = WA_LINE.exec(line)
  if (!m) return null
  let a = Number(m[1])
  let b = Number(m[2])
  let y = Number(m[3])
  if (m[1].length === 4) {
    // YYYY-MM-DD: normalise to day-first order (a = day, b = month).
    ;[y, b, a] = [a, b, y]
  } else if (y < 100) y += 2000
  return { a, b, y, h: Number(m[4]), min: Number(m[5]), ampm: m[7] ?? null, rest: m[8] }
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function parseWhatsApp(text: string): ParseResult | null {
  const lines = normalizeText(text).split('\n')
  const heads = lines.map(matchWa)
  const matched = heads.filter(Boolean) as WaHead[]
  if (matched.length < 2 && !(matched.length === 1 && lines.filter((l) => l.trim()).length === 1)) return null
  // Day-first unless any line proves month-first (second number > 12).
  const monthFirst = matched.some((h) => h.b > 12) && !matched.some((h) => h.a > 12)
  const rows: Array<Omit<ChatMessage, 'id' | 'sourceIndex'>> = []
  let skipped = 0
  let lastWasSystem = false
  lines.forEach((line, i) => {
    const head = heads[i]
    if (!head) {
      if (lastWasSystem) return
      if (rows.length) rows[rows.length - 1].text += `\n${line}`
      else if (line.trim()) skipped++
      return
    }
    const day = monthFirst ? head.b : head.a
    const month = monthFirst ? head.a : head.b
    let hour = head.h
    if (head.ampm) {
      const pm = /p/i.test(head.ampm)
      if (pm && hour < 12) hour += 12
      if (!pm && hour === 12) hour = 0
    }
    const timestamp = `${head.y}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(head.min)}`
    const s = WA_SENDER.exec(head.rest)
    if (!s) {
      // System notice such as "X added Y" or encryption banner — not a message.
      skipped++
      lastWasSystem = true
      return
    }
    lastWasSystem = false
    rows.push({ sender: s[1].trim(), timestamp, text: s[2] })
  })
  return { messages: withIds(rows), skipped, format: 'whatsapp', notes: [] }
}

const LINE_SENDER = /^([A-Za-z\u00C0-\u024F][\w\u00C0-\u024F .'\-]{0,40}):\s+(.+)$/

export function parseGenericText(text: string): ParseResult {
  const norm = normalizeText(text)
  const lines = norm.split('\n').filter((l) => l.trim())
  const senderLines = lines.filter((l) => LINE_SENDER.test(l)).length
  if (lines.length >= 2 && senderLines / lines.length >= 0.6) {
    const rows: Array<Omit<ChatMessage, 'id' | 'sourceIndex'>> = []
    for (const line of lines) {
      const m = LINE_SENDER.exec(line)
      if (m) rows.push({ sender: m[1].trim(), timestamp: null, text: m[2] })
      else if (rows.length) rows[rows.length - 1].text += `\n${line}`
      else rows.push({ sender: null, timestamp: null, text: line })
    }
    return { messages: withIds(rows), skipped: 0, format: 'lines', notes: ['Senders read from "Name: message" lines; no timestamps found.'] }
  }
  const blocks = norm.split(/\n\s*\n/).filter((b) => b.trim())
  return {
    messages: withIds(blocks.map((b) => ({ sender: null, timestamp: null, text: b }))),
    skipped: 0,
    format: 'paragraphs',
    notes: ['No sender pattern detected, so each paragraph is one message with an unknown sender.'],
  }
}

export function parseText(text: string): ParseResult {
  return parseWhatsApp(text) ?? parseGenericText(text)
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k]
  return undefined
}

function flattenText(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  // Telegram-style rich text arrays: ["plain", { type, text }]
  if (Array.isArray(v)) {
    const parts = v.map((p) => (typeof p === 'string' ? p : p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : '')).join('')
    return parts || null
  }
  return null
}

function toTimestamp(v: unknown): string | null {
  if (typeof v === 'number') {
    const ms = v < 1e12 ? v * 1000 : v
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 16)
  }
  if (typeof v === 'string' && v.trim()) return v.trim()
  return null
}

export function parseJson(raw: string): ParseResult {
  let data: unknown
  try {
    data = JSON.parse(normalizeText(raw))
  } catch {
    throw new ImportError('This JSON file could not be read. Check that it is valid JSON.')
  }
  const list = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as { messages?: unknown }).messages) ? (data as { messages: unknown[] }).messages : null
  if (!list) throw new ImportError('JSON must be an array of messages or an object with a "messages" array.')
  const rows: Array<Omit<ChatMessage, 'id' | 'sourceIndex'>> = []
  let skipped = 0
  for (const item of list) {
    if (!item || typeof item !== 'object') {
      skipped++
      continue
    }
    const o = item as Record<string, unknown>
    const text = flattenText(pick(o, ['text', 'content', 'body', 'message']))
    if (!text || !text.trim()) {
      skipped++
      continue
    }
    let sender = pick(o, ['sender', 'author', 'name', 'from', 'user'])
    if (sender && typeof sender === 'object') sender = pick(sender as Record<string, unknown>, ['name', 'username', 'id'])
    rows.push({
      sender: typeof sender === 'string' || typeof sender === 'number' ? String(sender) : null,
      timestamp: toTimestamp(pick(o, ['timestamp', 'date', 'time', 'created_at', 'ts'])),
      text,
    })
  }
  if (!rows.length) throw new ImportError('No message text was found. Expected fields such as "text", "content" or "body".')
  return { messages: withIds(rows), skipped, format: 'json', notes: [] }
}

/** Picks the chat transcript from a WhatsApp export archive. */
export function chooseZipChatEntry(names: string[]): string | null {
  const txt = names.filter((n) => /\.txt$/i.test(n) && !n.startsWith('__MACOSX'))
  const base = (n: string) => n.split('/').pop() ?? n
  return txt.find((n) => base(n) === '_chat.txt') ?? txt.find((n) => /^WhatsApp Chat/i.test(base(n))) ?? txt[0] ?? null
}

/** fflate is loaded on demand so it isn't part of the initial bundle. */
export async function parseZip(bytes: Uint8Array): Promise<ParseResult> {
  if (bytes.byteLength > LIMITS.maxFileBytes) throw new ImportError('This archive is larger than 8 MB.')
  const { unzipSync } = await import('fflate')
  let mediaSkipped = 0
  let expandedBytes = 0
  let oversized = false
  const names: string[] = []
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        if (f.name.endsWith('/')) return false
        if (/\.txt$/i.test(f.name)) {
          expandedBytes += f.originalSize
          if (expandedBytes > LIMITS.maxFileBytes) {
            oversized = true
            return false
          }
          names.push(f.name)
          return true
        }
        mediaSkipped++
        return false
      },
    })
  } catch {
    throw new ImportError('This archive could not be opened. Re-export the chat and try again.')
  }
  if (oversized) throw new ImportError('The expanded chat text is larger than 8 MB. Export a shorter range.')
  const entry = chooseZipChatEntry(names)
  if (!entry) throw new ImportError('No chat text (.txt) was found in this archive.')
  const result = parseText(new TextDecoder().decode(files[entry]))
  if (mediaSkipped) result.notes.push(`${mediaSkipped} media file${mediaSkipped === 1 ? '' : 's'} in the archive ignored.`)
  return result
}

function looksBinary(text: string) {
  const sample = text.slice(0, 4000)
  let bad = 0
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i)
    if (c === 0 || (c < 9 && c !== 0)) bad++
  }
  return bad > 4
}

export type FileKind = 'text' | 'json' | 'zip' | 'image' | 'pdf' | 'unsupported'

export function fileKind(file: { name: string; type: string }): FileKind {
  const n = file.name.toLowerCase()
  if (n.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') return 'zip'
  if (n.endsWith('.json') || file.type === 'application/json') return 'json'
  if (n.endsWith('.txt') || file.type === 'text/plain') return 'text'
  if (n.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf'
  if (/^image\/(png|jpeg|webp)$/.test(file.type) || /\.(png|jpe?g|webp)$/.test(n)) return 'image'
  return 'unsupported'
}

export async function parseFile(file: File): Promise<ParseResult> {
  if (file.size === 0) throw new ImportError(`${file.name} is empty.`)
  if (file.size > LIMITS.maxFileBytes) throw new ImportError(`${file.name} is larger than 8 MB. Export a shorter range of the chat.`)
  const kind = fileKind(file)
  if (kind === 'zip') return parseZip(new Uint8Array(await file.arrayBuffer()))
  if (kind === 'text' || kind === 'json') {
    const text = await file.text()
    if (looksBinary(text)) throw new ImportError(`${file.name} does not look like a text file.`)
    return kind === 'json' ? parseJson(text) : parseText(text)
  }
  throw new ImportError(`${file.name} is not a supported file. Use .txt, .json or a WhatsApp .zip export.`)
}

export function participants(messages: ChatMessage[]): string[] {
  const counts = new Map<string, number>()
  for (const m of messages) if (m.sender) counts.set(m.sender, (counts.get(m.sender) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n)
}

/** Re-numbers a selected range so source IDs stay deterministic. */
export function reindex(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m, i) => ({ ...m, id: `m${i + 1}`, sourceIndex: i }))
}
