import type { ActionItem, AnalysisResult, ChatMessage, EvidenceItem, TopicEvent } from '@/types'
import { rank } from './urgency'

export type Depth = 'quick' | 'standard' | 'deep'
export type Lens = 'all' | 'me' | 'urgent' | 'decisions' | 'tasks'
export type Section = 'highlights' | 'actions' | 'decisions' | 'mentions' | 'timeline'

export type CatchUpItem =
  | { key: string; section: 'highlights' | 'decisions' | 'mentions'; item: EvidenceItem }
  | { key: string; section: 'actions'; item: ActionItem }
  | { key: string; section: 'timeline'; item: TopicEvent }

export const SECTION_TITLE: Record<Section, string> = {
  highlights: 'Do first',
  actions: 'Action items',
  decisions: 'Decisions',
  mentions: 'Mentions & deadlines',
  timeline: 'Momentum',
}

export const DEPTH_LABEL: Record<Depth, string> = { quick: '30 sec', standard: '2 min', deep: 'Deep read' }

const byUrgency = <T extends EvidenceItem>(a: T, b: T) => rank(b.urgency) - rank(a.urgency)

export function buildItems(a: AnalysisResult): CatchUpItem[] {
  return [
    ...[...a.highlights].sort(byUrgency).map((item, i) => ({ key: `highlights-${i}`, section: 'highlights' as const, item })),
    ...[...a.actionItems].sort(byUrgency).map((item, i) => ({ key: `actions-${i}`, section: 'actions' as const, item })),
    ...a.decisions.map((item, i) => ({ key: `decisions-${i}`, section: 'decisions' as const, item })),
    ...a.mentions.map((item, i) => ({ key: `mentions-${i}`, section: 'mentions' as const, item })),
    ...a.topicEvents.map((item, i) => ({ key: `timeline-${i}`, section: 'timeline' as const, item })),
  ]
}

export function applyDepth(items: CatchUpItem[], depth: Depth): CatchUpItem[] {
  if (depth === 'deep') return items
  if (depth === 'standard') return items.filter((i) => i.section !== 'timeline')
  const top = (s: Section, n: number) => items.filter((i) => i.section === s).slice(0, n)
  return [...top('highlights', 3), ...top('actions', 3)]
}

function mentionsName(text: string, me: string) {
  const first = me.split(/\s+/)[0]
  const needles = [me, first].filter((n) => n.length >= 2).map((n) => n.toLowerCase())
  const t = text.toLowerCase()
  return needles.some((n) => t.includes(n))
}

/** Deterministic local filtering; no AI involved. */
export function applyLens(items: CatchUpItem[], lens: Lens, me: string | null, byId: Map<string, ChatMessage>): CatchUpItem[] {
  switch (lens) {
    case 'all':
      return items
    case 'urgent':
      return items.filter((i) => rank(i.item.urgency) >= rank('high'))
    case 'decisions':
      return items.filter((i) => i.section === 'decisions')
    case 'tasks':
      return items.filter((i) => i.section === 'actions')
    case 'me': {
      if (!me) return []
      return items.filter((i) => {
        if (i.section === 'actions' && i.item.owner && mentionsName(i.item.owner, me)) return true
        if (mentionsName(i.item.text, me)) return true
        return i.item.citationIds.some((id) => {
          const m = byId.get(id)
          return !!m && (m.sender === me ? false : mentionsName(m.text, me))
        })
      })
    }
  }
}
