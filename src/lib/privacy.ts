import type { ChatMessage, PrivacySettings } from '@/types'

export const DEFAULT_PRIVACY: PrivacySettings = { email: true, phone: true, url: false, customTerms: [] }

type Category = 'EMAIL' | 'PHONE' | 'URL' | 'TERM'

const PATTERNS: Record<Exclude<Category, 'TERM'>, RegExp> = {
  EMAIL: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  URL: /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi,
  // 8+ digits allowing spaces, dashes, dots, parentheses and a leading +.
  PHONE: /(?<![\w/.:])\+?\(?\d[\d\s()-]{5,}\d(?![\w/.:])/g,
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isPhone(candidate: string) {
  const digits = candidate.replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15
}

export type MaskedConversation = {
  /** Messages exactly as sent to Gemini. */
  prepared: ChatMessage[]
  /** Local-only placeholder → original value. Never sent to the server. */
  map: Map<string, string>
  counts: Record<Category, number>
}

export function maskMessages(messages: ChatMessage[], settings: PrivacySettings): MaskedConversation {
  const map = new Map<string, string>()
  const byValue = new Map<string, string>()
  const counts: Record<Category, number> = { EMAIL: 0, PHONE: 0, URL: 0, TERM: 0 }

  const placeholder = (cat: Category, value: string) => {
    const key = `${cat}:${value.toLowerCase()}`
    let ph = byValue.get(key)
    if (!ph) {
      counts[cat]++
      ph = `[${cat}_${counts[cat]}]`
      byValue.set(key, ph)
      map.set(ph, value)
    }
    return ph
  }

  const terms = settings.customTerms.map((t) => t.trim()).filter((t) => t.length >= 2).sort((a, b) => b.length - a.length)
  const termRe = terms.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${terms.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null

  const apply = (s: string) => {
    let out = s
    if (settings.email) out = out.replace(PATTERNS.EMAIL, (v) => placeholder('EMAIL', v))
    if (settings.url) out = out.replace(PATTERNS.URL, (v) => placeholder('URL', v))
    if (settings.phone) out = out.replace(PATTERNS.PHONE, (v) => (isPhone(v) ? placeholder('PHONE', v) : v))
    if (termRe) out = out.replace(termRe, (v) => placeholder('TERM', v))
    return out
  }

  const prepared = messages.map((m) => ({ ...m, text: apply(m.text), sender: m.sender ? apply(m.sender) : null }))
  return { prepared, map, counts }
}

/** Restores original values inside AI text for local display only. */
export function unmask(text: string, map: Map<string, string>): string {
  if (!map.size) return text
  return text.replace(/\[(?:EMAIL|PHONE|URL|TERM)_\d+\]/g, (ph) => map.get(ph) ?? ph)
}

/** Shape sent over the network: IDs, sender, timestamp and prepared text only. */
export function toPayload(prepared: ChatMessage[]) {
  return prepared.map(({ id, sender, timestamp, text }) => ({ id, sender, timestamp, text }))
}
