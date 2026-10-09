import type { ActionItem, AnalysisResult, AskAnswer, ChatMessage, Confidence, EvidenceItem, MessageUrgency, TopicEvent } from '@/types'
import { isLevel, maxLevel, messageLevel, resolveItemUrgency } from './urgency'

type Raw = Record<string, unknown>

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const conf = (v: unknown): Confidence => (v === 'high' || v === 'medium' || v === 'low' ? v : 'low')
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter((x): x is Raw => !!x && typeof x === 'object') : [])

export class ValidationError extends Error {}

/**
 * Validates Gemini's structured analysis against the messages that were sent.
 * Invalid citations/urgency entries are dropped and counted, never repaired by guessing.
 */
export function validateAnalysis(raw: unknown, messages: ChatMessage[], model = 'gemini'): AnalysisResult {
  if (!raw || typeof raw !== 'object') throw new ValidationError('Empty analysis')
  const r = raw as Raw
  const ids = new Set(messages.map((m) => m.id))
  let issues = 0

  const messageUrgencies: MessageUrgency[] = []
  const seen = new Set<string>()
  for (const u of arr(r.messageUrgencies)) {
    const id = str(u.messageId)
    const reason = str(u.reason)
    if (!id || !ids.has(id) || seen.has(id) || !reason || !(u.urgency === 'medium' || u.urgency === 'high' || u.urgency === 'critical')) {
      issues++
      continue
    }
    seen.add(id)
    messageUrgencies.push({ messageId: id, urgency: u.urgency, reason, confidence: conf(u.confidence) })
  }
  const map = new Map(messageUrgencies.map((u) => [u.messageId, u]))

  const evidence = (x: Raw): EvidenceItem | null => {
    const text = str(x.text)
    const rawCites = Array.isArray(x.citationIds) ? x.citationIds.filter((c): c is string => typeof c === 'string') : []
    const citationIds = [...new Set(rawCites.filter((c) => ids.has(c)))]
    if (citationIds.length !== rawCites.length) issues++
    if (!text || !citationIds.length) {
      issues++
      return null
    }
    const reason = str(x.urgencyReason)
    // Elevated levels need a stated reason; otherwise inherit from cited messages.
    let level: unknown = x.urgency
    if (isLevel(level) && level !== 'low' && !reason) {
      issues++
      level = undefined
    }
    const urgency = resolveItemUrgency(level, citationIds, map)
    const inheritedReason = reason ?? (urgency !== 'low' ? (citationIds.map((c) => map.get(c)).find((u) => u?.urgency === urgency)?.reason ?? null) : null)
    return { text, citationIds, confidence: conf(x.confidence), urgency, urgencyReason: inheritedReason }
  }

  const list = (v: unknown) => arr(v).map(evidence).filter((e): e is EvidenceItem => !!e)

  const actionItems: ActionItem[] = arr(r.actionItems).flatMap((x) => {
    const e = evidence(x)
    if (!e) return []
    const status = x.status === 'open' || x.status === 'done' ? x.status : 'unclear'
    return [{ ...e, owner: str(x.owner), dueAt: str(x.dueAt), status }]
  })

  const topicEvents: TopicEvent[] = arr(r.topicEvents).flatMap((x) => {
    const e = evidence(x)
    const label = str(x.label)
    if (!e || !label) return []
    return [{ ...e, label, timestamp: str(x.timestamp) }]
  })

  const brief = str(r.brief)
  if (!brief) throw new ValidationError('Analysis had no summary')

  return {
    brief,
    highlights: list(r.highlights),
    decisions: list(r.decisions),
    actionItems,
    mentions: list(r.mentions),
    topicEvents,
    messageUrgencies,
    validationIssues: issues,
    model,
    analyzedAt: new Date().toISOString(),
  }
}

export function validateAnswer(raw: unknown, messages: ChatMessage[], question: string, analysis: AnalysisResult | null): AskAnswer {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Raw
  const ids = new Set(messages.map((m) => m.id))
  const citationIds = (Array.isArray(r.citationIds) ? r.citationIds : []).filter((c): c is string => typeof c === 'string' && ids.has(c))
  const answer = str(r.answer)
  const map = new Map((analysis?.messageUrgencies ?? []).map((u) => [u.messageId, u]))
  // An answer without valid evidence is treated as not found rather than shown as fact.
  if (r.status !== 'answered' || !answer || !citationIds.length) {
    return { id: crypto.randomUUID(), question, status: 'not_found', answer: "I couldn't find that in this conversation.", citationIds: [], urgency: 'low', urgencyReason: null }
  }
  const reason = str(r.urgencyReason)
  const cited = maxLevel(citationIds.map((c) => messageLevel(c, map)))
  const urgency = isLevel(r.urgency) && (r.urgency === 'low' || reason) ? r.urgency : cited
  return { id: crypto.randomUUID(), question, status: 'answered', answer, citationIds, urgency, urgencyReason: reason }
}

export function validateExtract(raw: unknown): { rows: Array<{ sender: string | null; timestamp: string | null; text: string }>; warnings: string[] } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Raw
  const rows = arr(r.messages)
    .map((m) => ({ sender: str(m.sender), timestamp: str(m.timestamp), text: str(m.text) ?? '' }))
    .filter((m) => m.text)
  const warnings = Array.isArray(r.warnings) ? r.warnings.filter((w): w is string => typeof w === 'string' && !!w.trim()) : []
  if (!rows.length) throw new ValidationError('No readable messages were found in these files.')
  return { rows, warnings }
}
