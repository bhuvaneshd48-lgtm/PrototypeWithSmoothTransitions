import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { LoaderCircle, RotateCcw, Search, Send, Square } from 'lucide-react'
import type { AskAnswer, ChatMessage } from '@/types'
import UrgencyBadge from './UrgencyBadge'
import { CitationChips, type CiteHandler } from './CatchUpCard'

type Props = {
  answers: AskAnswer[]
  busy: boolean
  error: string | null
  pendingQuestion: string | null
  onAsk: (q: string) => void
  onCancel: () => void
  onRetry: () => void
  suggestions: string[]
  activeKey: string | null
  onActivate: (key: string) => void
  onCite: CiteHandler
  byId: Map<string, ChatMessage>
  unmask: (s: string) => string
  disabled: string | null
}

export const MAX_QUESTION = 500

export default function AskPanel({ answers, busy, error, pendingQuestion, onAsk, onCancel, onRetry, suggestions, activeKey, onActivate, onCite, byId, unmask, disabled }: Props) {
  const [q, setQ] = useState('')
  const submit = (text: string) => {
    const t = text.trim()
    if (!t || busy || disabled) return
    onAsk(t)
    setQ('')
  }
  return (
    <section aria-labelledby="ask-title" className="flex h-full min-h-0 flex-col">
      <div className="px-5 pt-5">
        <h2 id="ask-title" className="font-display text-2xl font-extrabold uppercase">
          Ask Unread
        </h2>
        <p className="mt-1 text-sm text-ink-soft">Answers come only from this conversation, with sources.</p>
      </div>
      <div className="scrollbar-thin mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-4" aria-live="polite">
        {!answers.length && !busy ? (
          <ul className="space-y-2" aria-label="Suggested questions">
            {suggestions.map((s) => (
              <li key={s}>
                <button type="button" disabled={!!disabled} onClick={() => submit(s)} className="flex w-full items-center gap-2 rounded-2xl border border-ink/10 bg-paper/60 px-4 py-3 text-left text-sm transition hover:border-ink disabled:opacity-40">
                  <Search className="size-4 shrink-0 text-muted" aria-hidden /> {s}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <AnimatePresence initial={false}>
          {answers.map((a) => {
            const key = `answer-${a.id}`
            const active = activeKey === key
            return (
              <motion.article
                key={a.id}
                tabIndex={0}
                onFocus={(e) => e.target === e.currentTarget && onActivate(key)}
                onClick={() => onActivate(key)}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className={`lvl-${a.urgency} focus-urgency cursor-pointer rounded-[22px] border bg-card p-4 transition-[border-color] duration-500 ${active ? 'border-[color:var(--l-accent)]' : 'border-ink/10'}`}
              >
                <p className="text-xs font-semibold text-muted">{a.question}</p>
                {a.status === 'answered' ? (
                  <>
                    <div className="mt-2">
                      <UrgencyBadge level={a.urgency} reason={a.urgencyReason} size="sm" />
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">{unmask(a.answer)}</p>
                    <div className="mt-3">
                      <CitationChips ids={a.citationIds} byId={byId} onCite={onCite} label="this answer" />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-[15px] font-medium">I couldn’t find that in this conversation.</p>
                    <p className="mt-1 text-sm text-ink-soft">Try asking about something the group discussed:</p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {suggestions.map((s) => (
                        <li key={s}>
                          <button type="button" disabled={busy} onClick={(e) => (e.stopPropagation(), submit(s))} className="rounded-full border border-ink/15 px-3 py-1 text-xs hover:border-ink">
                            {s}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </motion.article>
            )
          })}
        </AnimatePresence>
        {busy ? (
          <div className="flex items-center justify-between gap-3 rounded-[22px] border border-dashed border-ink/20 p-4 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden />
              <span className="truncate">Gemini is checking the messages for “{pendingQuestion}”</span>
            </span>
            <button type="button" onClick={onCancel} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ink/15 px-3 py-1 text-xs font-semibold hover:border-ink">
              <Square className="size-3" aria-hidden /> Cancel
            </button>
          </div>
        ) : null}
        {error && !busy ? (
          <div role="alert" className="rounded-[22px] border border-[#c2381f]/30 bg-[#fde3d9] p-4 text-sm text-[#8a2310]">
            <p>{error}</p>
            {pendingQuestion ? (
              <button type="button" onClick={onRetry} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#8a2310] px-3 py-1.5 text-xs font-semibold text-white">
                <RotateCcw className="size-3" aria-hidden /> Retry
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <form
        className="border-t border-line p-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit(q)
        }}
      >
        <label htmlFor="ask" className="sr-only">
          Ask about this conversation
        </label>
        <div className="flex items-end gap-2 rounded-[22px] border border-ink/15 bg-card p-2 focus-within:border-ink">
          <textarea
            id="ask"
            rows={2}
            value={q}
            maxLength={MAX_QUESTION}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit(q)
              }
            }}
            disabled={!!disabled}
            placeholder={disabled ?? 'When is the report due?'}
            className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:outline-none"
          />
          <button type="submit" disabled={!q.trim() || busy || !!disabled} className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-paper transition active:scale-95 disabled:opacity-30" aria-label="Ask">
            <Send className="size-4" aria-hidden />
          </button>
        </div>
      </form>
    </section>
  )
}
