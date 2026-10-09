import type { AnalysisResult, ChatMessage, EvidenceItem, MessageUrgency, UrgencyLevel } from '@/types'

export const LEVELS: UrgencyLevel[] = ['low', 'medium', 'high', 'critical']

export const LEVEL_LABEL: Record<UrgencyLevel, string> = {
  low: 'Low',
  medium: 'Attention',
  high: 'High',
  critical: 'Critical',
}

export function rank(level: UrgencyLevel): number {
  return LEVELS.indexOf(level)
}

export function isLevel(v: unknown): v is UrgencyLevel {
  return typeof v === 'string' && (LEVELS as string[]).includes(v)
}

export function maxLevel(levels: UrgencyLevel[]): UrgencyLevel {
  return levels.reduce<UrgencyLevel>((best, l) => (rank(l) > rank(best) ? l : best), 'low')
}

export function urgencyMap(analysis: AnalysisResult | null): Map<string, MessageUrgency> {
  return new Map((analysis?.messageUrgencies ?? []).map((u) => [u.messageId, u]))
}

/** Gemini returns urgency only for meaningful messages; absent messages are low. */
export function messageLevel(id: string, map: Map<string, MessageUrgency>): UrgencyLevel {
  return map.get(id)?.urgency ?? 'low'
}

/** Item keeps a validated Gemini level; otherwise it inherits the highest cited message level. */
export function resolveItemUrgency(rawLevel: unknown, citationIds: string[], map: Map<string, MessageUrgency>): UrgencyLevel {
  if (isLevel(rawLevel)) return rawLevel
  return maxLevel(citationIds.map((id) => messageLevel(id, map)))
}

export function highestInAnalysis(a: AnalysisResult): UrgencyLevel {
  const all: EvidenceItem[] = [...a.highlights, ...a.decisions, ...a.actionItems, ...a.mentions]
  return maxLevel(all.map((i) => i.urgency))
}

export function messagesById(messages: ChatMessage[]) {
  return new Map(messages.map((m) => [m.id, m]))
}
