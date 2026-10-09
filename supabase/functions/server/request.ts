import { ServiceError } from './errors.ts'
import { supportedLanguage } from '../_shared/languages.ts'

export type Action = 'analyze' | 'ask' | 'extract'
export type Message = { id: string; sender: string | null; timestamp: string | null; text: string }
export type Part = { text: string } | { inlineData: { mimeType: string; data: string } }
export type ValidRequest =
  | { action: 'extract'; files: Array<{ mimeType: string; data: string }> }
  | { action: 'analyze' | 'ask'; messages: Message[]; language: string; question: string; previousQuestion: string | null }

export const MAX_BODY_BYTES = 22 * 1024 * 1024
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_CHARS = 400_000
const MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
const invalid = (message: string): never => { throw new ServiceError(400, 'server', message) }
const tooLarge = (): never => { throw new ServiceError(413, 'too_large', 'This input is too large. Choose a shorter range or fewer files.') }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const nullableString = (v: unknown, max: number): v is string | null => v === null || (typeof v === 'string' && v.length <= max)

/** Bounds actual streamed bytes, not just the client-supplied Content-Length. */
export async function readJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get('content-length'))
  if (length > MAX_BODY_BYTES) tooLarge()
  if (!request.body) return invalid('Invalid JSON body.')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_BODY_BYTES) {
        await reader.cancel()
        tooLarge()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return invalid('Invalid JSON body.')
  }
}

export function validateRequest(action: Action, raw: unknown): ValidRequest {
  if (!record(raw)) return invalid('Expected a JSON object.')
  if (action === 'extract') {
    if (!Array.isArray(raw.files) || !raw.files.length) return invalid('No files supplied.')
    if (raw.files.length > 10) tooLarge()
    let bytes = 0
    const files = raw.files.map((file) => {
      if (!record(file) || typeof file.mimeType !== 'string' || !MIME_TYPES.has(file.mimeType) ||
        typeof file.data !== 'string' || !file.data.length || file.data.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(file.data)) return invalid('Unsupported file or invalid base64 data.')
      bytes += file.data.length * 3 / 4 - (file.data.endsWith('==') ? 2 : file.data.endsWith('=') ? 1 : 0)
      if (bytes > MAX_FILE_BYTES) tooLarge()
      return { mimeType: file.mimeType, data: file.data }
    })
    if (files.some((file) => file.mimeType === 'application/pdf') && files.length !== 1) return invalid('Import one PDF at a time, or screenshots only.')
    return { action, files }
  }
  if (!Array.isArray(raw.messages) || !raw.messages.length) return invalid('No messages supplied.')
  if (raw.messages.length > 1500) tooLarge()
  const ids = new Set<string>()
  let chars = 0
  const messages = raw.messages.map((message) => {
    if (!record(message) || typeof message.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(message.id) ||
      ids.has(message.id) || typeof message.text !== 'string' || !message.text.trim() ||
      !nullableString(message.sender, 500) || !nullableString(message.timestamp, 100)) return invalid('Invalid message fields or duplicate message IDs.')
    ids.add(message.id)
    chars += message.text.length + message.id.length + (message.sender?.length ?? 7) + (message.timestamp?.length ?? 1) + 10
    if (chars > MAX_CHARS) tooLarge()
    return { id: message.id, sender: message.sender, timestamp: message.timestamp, text: message.text }
  })
  const language = supportedLanguage(raw.language)
  const question = typeof raw.question === 'string' ? raw.question.trim() : ''
  if (action === 'ask' && (!question || question.length > 1000)) return invalid('Question must contain 1–1000 characters.')
  const previousQuestion = typeof raw.previousQuestion === 'string' ? raw.previousQuestion.slice(0, 500) : null
  return { action, messages, language, question, previousQuestion }
}
