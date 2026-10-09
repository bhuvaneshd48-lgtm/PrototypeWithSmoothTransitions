import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import type { ChatMessage, MessageUrgency } from '@/types'
import { messageLevel } from '@/lib/urgency'
import Dialog from './Dialog'
import UrgencyBadge from './UrgencyBadge'

type Props = {
  open: boolean
  onClose: () => void
  messages: ChatMessage[]
  citationIds: string[]
  focusId: string | null
  onFocusId: (id: string) => void
  urgencies: Map<string, MessageUrgency>
  reduced: boolean
}

function ts(t: string | null) {
  if (!t) return null
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? t : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function SourceDrawer({ open, onClose, messages, citationIds, focusId, onFocusId, urgencies, reduced }: Props) {
  const focusRef = useRef<HTMLLIElement | null>(null)
  const pos = focusId ? citationIds.indexOf(focusId) : -1

  useEffect(() => {
    if (!open || !focusId) return
    const t = window.setTimeout(() => {
      focusRef.current?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
      focusRef.current?.focus({ preventScroll: true })
    }, 120)
    return () => window.clearTimeout(t)
  }, [open, focusId, reduced])

  const cited = new Set(citationIds)
  const step = (d: number) => {
    const next = citationIds[(pos + d + citationIds.length) % citationIds.length]
    if (next) onFocusId(next)
  }

  return (
    <Dialog open={open} onClose={onClose} title="Source" variant="right">
      {citationIds.length > 1 ? (
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-card/95 px-6 py-3 backdrop-blur">
          <p className="font-mono text-xs text-muted">
            Source {pos + 1} of {citationIds.length}
          </p>
          <div className="flex gap-1">
            <button type="button" onClick={() => step(-1)} className="grid size-9 place-items-center rounded-full border border-ink/15 hover:border-ink" aria-label="Previous cited message">
              <ChevronDown className="size-4 rotate-180" aria-hidden />
            </button>
            <button type="button" onClick={() => step(1)} className="grid size-9 place-items-center rounded-full border border-ink/15 hover:border-ink" aria-label="Next cited message">
              <ChevronDown className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
      <ol className="px-3 py-3" aria-label="Original conversation">
        {messages.map((m) => {
          const isFocus = m.id === focusId
          const isCited = cited.has(m.id)
          const level = messageLevel(m.id, urgencies)
          const u = urgencies.get(m.id)
          return (
            <li
              key={m.id}
              ref={isFocus ? focusRef : undefined}
              tabIndex={isCited ? 0 : -1}
              onFocus={() => isCited && !isFocus && onFocusId(m.id)}
              className={`msg-row lvl-${level} relative rounded-2xl px-4 py-3 outline-none transition-colors duration-500 ${isFocus ? 'bg-[color:var(--l-tint)]' : isCited ? 'bg-paper' : ''} focus-visible:ring-2 focus-visible:ring-ink`}
            >
              {isFocus ? (
                <motion.span aria-hidden layoutId={reduced ? undefined : 'source-line'} className="absolute inset-y-2 left-0 w-1 rounded-full" style={{ background: 'var(--l-accent)' }} />
              ) : null}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-muted">{m.id}</span>
                <span className="font-semibold text-ink-soft">{m.sender ?? 'Unknown sender'}</span>
                {m.timestamp ? <span className="font-mono text-muted">{ts(m.timestamp)}</span> : null}
                {level !== 'low' ? <UrgencyBadge level={level} reason={u?.reason} size="sm" /> : null}
              </div>
              <p className={`mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed ${isCited ? 'text-ink' : 'text-ink-soft'}`}>{m.text}</p>
              {isFocus && u ? <p className="mt-1.5 text-xs" style={{ color: 'var(--l-text)' }}>Gemini: {u.reason}</p> : null}
            </li>
          )
        })}
      </ol>
    </Dialog>
  )
}
