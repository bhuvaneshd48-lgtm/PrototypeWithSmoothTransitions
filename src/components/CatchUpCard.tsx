import { forwardRef } from 'react'
import { motion } from 'motion/react'
import { Quote } from 'lucide-react'
import type { ChatMessage, UrgencyLevel } from '@/types'
import UrgencyBadge from './UrgencyBadge'

export type CiteHandler = (citationIds: string[], focusId: string, trigger: HTMLElement) => void

export function CitationChips({ ids, byId, onCite, label }: { ids: string[]; byId: Map<string, ChatMessage>; onCite: CiteHandler; label: string }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={`Sources for ${label}`}>
      {ids.map((id) => {
        const m = byId.get(id)
        return (
          <li key={id}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onCite(ids, id, e.currentTarget)
              }}
              className="group inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-card px-2.5 py-1 font-mono text-[11px] text-ink-soft transition hover:border-ink hover:text-ink active:scale-95"
              aria-label={`Open source message ${id}${m?.sender ? ` from ${m.sender}` : ''}`}
            >
              <Quote className="size-3 transition-transform group-hover:-rotate-12" aria-hidden />
              {id}
              {m?.sender ? <span className="max-w-[9rem] truncate font-sans text-[11px] font-medium">{m.sender.split(' ')[0]}</span> : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

type CardProps = {
  itemKey: string
  active: boolean
  urgency: UrgencyLevel
  urgencyReason: string | null
  eyebrow?: string
  title: string
  meta?: Array<[string, string]>
  citationIds: string[]
  byId: Map<string, ChatMessage>
  onActivate: (key: string) => void
  onCite: CiteHandler
  index: number
  reduced: boolean
}

const CatchUpCard = forwardRef<HTMLElement, CardProps>(function CatchUpCard(
  { itemKey, active, urgency, urgencyReason, eyebrow, title, meta, citationIds, byId, onActivate, onCite, index, reduced },
  ref,
) {
  return (
    <motion.article
      ref={ref}
      layout={!reduced}
      data-key={itemKey}
      tabIndex={0}
      aria-current={active ? 'true' : undefined}
      onFocus={(e) => e.target === e.currentTarget && onActivate(itemKey)}
      onClick={() => onActivate(itemKey)}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 26, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={reduced ? { duration: 0.15 } : { type: 'spring', stiffness: 260, damping: 30, delay: Math.min(index, 8) * 0.045 }}
      className={`lvl-${urgency} focus-urgency relative cursor-pointer overflow-hidden rounded-[24px] border bg-card/95 p-5 pl-6 backdrop-blur transition-[box-shadow,border-color] duration-500 sm:p-6 sm:pl-7 ${
        active ? 'border-[color:var(--l-accent)] shadow-[0_22px_60px_-30px_var(--l-accent)]' : 'border-ink/10 shadow-[0_10px_30px_-24px_rgba(18,18,16,0.5)]'
      }`}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 transition-all duration-500" style={{ background: 'var(--l-accent)', opacity: active ? 1 : 0.55 }} />
      <div className="flex flex-wrap items-center gap-2">
        <UrgencyBadge level={urgency} reason={urgencyReason} size="sm" />
        {eyebrow ? <span className="font-mono text-[11px] uppercase tracking-wider text-muted">{eyebrow}</span> : null}
      </div>
      <p className="mt-3 text-[17px] font-medium leading-snug text-ink sm:text-lg">{title}</p>
      {urgencyReason && urgency !== 'low' ? <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--l-text)' }}>Why: {urgencyReason}</p> : null}
      {meta?.length ? (
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {meta.map(([k, v]) => (
            <div key={k} className="flex gap-1.5">
              <dt className="text-muted">{k}</dt>
              <dd className={`font-medium ${v === 'Not stated' ? 'italic text-muted' : ''}`}>{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="mt-4">
        <CitationChips ids={citationIds} byId={byId} onCite={onCite} label={title.slice(0, 60)} />
      </div>
    </motion.article>
  )
})

export default CatchUpCard
