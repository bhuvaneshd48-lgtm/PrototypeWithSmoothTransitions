import type { ChatMessage, ConversationRecord } from '@/types'

export type RangePreset = 'all' | 'since-last' | '24h' | '7d' | 'last-100'

const key = (m: ChatMessage) => `${m.sender ?? ''}|${m.timestamp ?? ''}|${m.text}`

/**
 * If an earlier import of the same chat exists, returns the id of the first message
 * that wasn't in it (matched by sender + timestamp + text of the earlier import's last message).
 */
export function findSinceLast(messages: ChatMessage[], previous: ConversationRecord[]): { fromId: string; previousTitle: string } | null {
  const index = new Map<string, number>()
  messages.forEach((m, i) => index.set(key(m), i))
  let best: { at: number; title: string } | null = null
  for (const r of previous) {
    const last = r.messages[r.messages.length - 1]
    if (!last) continue
    const at = index.get(key(last))
    // Only meaningful when there are new messages after the overlap point.
    if (at !== undefined && at < messages.length - 1 && (!best || at > best.at)) best = { at, title: r.title }
  }
  return best ? { fromId: messages[best.at + 1].id, previousTitle: best.title } : null
}

function parse(t: string | null): number | null {
  if (!t) return null
  const n = new Date(t).getTime()
  return Number.isNaN(n) ? null : n
}

/** Resolves a preset to a start message id (null = from the beginning). Returns undefined if unavailable. */
export function presetStart(messages: ChatMessage[], preset: RangePreset, sinceLastId: string | null): string | null | undefined {
  if (!messages.length) return undefined
  switch (preset) {
    case 'all':
      return null
    case 'since-last':
      return sinceLastId ?? undefined
    case 'last-100':
      return messages.length > 100 ? messages[messages.length - 100].id : undefined
    case '24h':
    case '7d': {
      const end = [...messages].reverse().map((m) => parse(m.timestamp)).find((n) => n !== null)
      if (end == null) return undefined
      const cutoff = end - (preset === '24h' ? 1 : 7) * 86_400_000
      const first = messages.find((m) => {
        const n = parse(m.timestamp)
        return n !== null && n >= cutoff
      })
      return first && first.id !== messages[0].id ? first.id : undefined
    }
  }
}

/** Messages covered by the record's catch-up range. */
export function inRange(record: Pick<ConversationRecord, 'messages' | 'readFrom'>): ChatMessage[] {
  if (!record.readFrom) return record.messages
  const i = record.messages.findIndex((m) => m.id === record.readFrom)
  return i > 0 ? record.messages.slice(i) : record.messages
}
