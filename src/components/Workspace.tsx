import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { Check, LoaderCircle, MessageSquareText, RotateCcw, Sparkles, User } from 'lucide-react'
import type { AskAnswer, ConversationRecord, UrgencyLevel } from '@/types'
import { applyDepth, applyLens, buildItems, DEPTH_LABEL, SECTION_TITLE, type CatchUpItem, type Depth, type Lens, type Section } from '@/lib/catchup'
import { highestInAnalysis, LEVEL_LABEL, messageLevel, messagesById, urgencyMap } from '@/lib/urgency'
import { participants } from '@/lib/parsers'
import { unmask as unmaskWith, type MaskedConversation } from '@/lib/privacy'
import CatchUpCard, { type CiteHandler } from './CatchUpCard'
import SourceDrawer from './SourceDrawer'
import AskPanel from './AskPanel'
import UrgencyBadge from './UrgencyBadge'
import Dialog from './Dialog'

export type AnalysisStatus = { state: 'idle' } | { state: 'running'; phase: number } | { state: 'error'; message: string }

type Props = {
  record: ConversationRecord
  masked: MaskedConversation
  status: AnalysisStatus
  onRetry: () => void
  onSetMe: (me: string | null) => void
  onUrgency: (level: UrgencyLevel) => void
  reduced: boolean
  rail: (close?: () => void) => React.ReactNode
  askState: {
    answers: AskAnswer[]
    busy: boolean
    error: string | null
    pendingQuestion: string | null
    onAsk: (q: string) => void
    onCancel: () => void
    onRetry: () => void
  }
}

const LENSES: Array<[Lens, string]> = [
  ['all', 'All'],
  ['me', 'For me'],
  ['urgent', 'Urgent'],
  ['decisions', 'Decisions'],
  ['tasks', 'Tasks'],
]
const SECTIONS: Section[] = ['highlights', 'actions', 'decisions', 'mentions', 'timeline']

function ts(t: string | null) {
  if (!t) return null
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? t : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function Workspace({ record, masked, status, onRetry, onSetMe, onUrgency, reduced, rail, askState }: Props) {
  const analysis = record.analysis
  const [depth, setDepth] = useState<Depth>('standard')
  const [lens, setLens] = useState<Lens>('all')
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<{ ids: string[]; focusId: string } | null>(null)
  const [railOpen, setRailOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const suppressScrollUntil = useRef(0)
  const nodes = useRef(new Map<string, HTMLElement>())

  const byId = useMemo(() => messagesById(record.messages), [record.messages])
  const urgencies = useMemo(() => urgencyMap(analysis), [analysis])
  const people = useMemo(() => participants(record.messages), [record.messages])
  const unmask = useCallback((s: string) => unmaskWith(s, masked.map), [masked.map])
  const all = useMemo(() => (analysis ? buildItems(analysis) : []), [analysis])
  const visible = useMemo(() => applyLens(applyDepth(all, depth), lens, record.me, byId), [all, depth, lens, record.me, byId])

  // Lens/depth changes move focus to the first remaining item so the atmosphere never shows stale urgency.
  useEffect(() => {
    suppressScrollUntil.current = Date.now() + 900
    setActiveKey((k) => (k?.startsWith('answer-') || visible.some((v) => v.key === k) ? k : (visible[0]?.key ?? null)))
  }, [visible])
  useEffect(() => {
    setActiveKey(visible[0]?.key ?? null)
  }, [lens])

  // Scroll reading: activate a card when it crosses the middle band of the viewport.
  useEffect(() => {
    let timer = 0
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting)
        if (!hit) return
        window.clearTimeout(timer)
        timer = window.setTimeout(() => {
          if (Date.now() < suppressScrollUntil.current) return
          const key = (hit.target as HTMLElement).dataset.key
          if (key) setActiveKey(key)
        }, 160)
      },
      { rootMargin: '-46% 0px -46% 0px' },
    )
    nodes.current.forEach((n) => io.observe(n))
    return () => {
      window.clearTimeout(timer)
      io.disconnect()
    }
  }, [visible])

  const activate = useCallback((key: string) => {
    suppressScrollUntil.current = Date.now() + 900
    setActiveKey(key)
  }, [])

  const onCite: CiteHandler = useCallback((ids, focusId) => setDrawer({ ids, focusId }), [])

  const answerLevel = activeKey?.startsWith('answer-') ? askState.answers.find((a) => `answer-${a.id}` === activeKey)?.urgency : undefined
  const itemLevel = visible.find((v) => v.key === activeKey)?.item.urgency
  const level: UrgencyLevel = drawer ? messageLevel(drawer.focusId, urgencies) : (answerLevel ?? itemLevel ?? 'low')
  useEffect(() => onUrgency(level), [level, onUrgency])

  const suggestions = useMemo(() => {
    const s: string[] = []
    if (record.me) s.push(`What does ${record.me.split(' ')[0]} need to do?`)
    if (analysis?.actionItems.some((a) => a.dueAt)) s.push('What is due soonest?')
    if (analysis?.actionItems.length) s.push('Who owns the open tasks?')
    if (analysis?.decisions.length) s.push('What did the group decide?')
    s.push('What changed most recently?')
    return s.slice(0, 4)
  }, [analysis, record.me])

  const stamps = record.messages.map((m) => m.timestamp).filter(Boolean) as string[]
  const askDisabled = status.state === 'running' ? 'Wait for the analysis to finish…' : !analysis ? 'Analyze the conversation first' : null
  const ask = <AskPanel {...askState} suggestions={suggestions} activeKey={activeKey} onActivate={activate} onCite={onCite} byId={byId} unmask={unmask} disabled={askDisabled} />

  return (
    <div className="relative z-10 mx-auto grid w-full max-w-[1500px] gap-6 px-4 pb-24 sm:px-6 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_380px]">
      <motion.aside layout initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="sticky top-20 hidden h-[calc(100vh-6rem)] rounded-[28px] border border-ink/10 bg-paper/60 backdrop-blur lg:block">
        {rail()}
      </motion.aside>

      <main id="main" className="min-w-0">
        <div className="flex items-center gap-2 xl:hidden">
          <button type="button" onClick={() => setRailOpen(true)} className="lg:hidden inline-flex items-center gap-2 rounded-full border border-ink/15 bg-card/80 px-4 py-2 text-sm font-medium">
            <MessageSquareText className="size-4" aria-hidden /> Conversations
          </button>
          <button type="button" onClick={() => setAskOpen(true)} className="ml-auto inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper xl:hidden">
            <Sparkles className="size-4" aria-hidden /> Ask
          </button>
        </div>

        {/* Pulse */}
        <motion.section layout aria-labelledby="pulse-title" initial={{ opacity: 0, y: 30, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="mt-4 overflow-hidden rounded-[32px] xl:mt-0 border border-ink/10 bg-card/90 p-6 backdrop-blur sm:p-8 lg:mt-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-xs uppercase tracking-wider text-muted">Pulse · {record.transcribed ? 'Transcribed by Gemini' : record.sourceType}</p>
              <h1 id="pulse-title" className="mt-1 break-words font-display text-[clamp(2.4rem,5vw,4.4rem)] font-black uppercase leading-[0.86]">
                {record.title}
              </h1>
            </div>
            {analysis ? <UrgencyBadge level={highestInAnalysis(analysis)} reason="Highest urgency in this catch-up" /> : null}
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-4 border-y border-line py-4 sm:grid-cols-4">
            {(
              [
                ['Messages', record.messages.length.toLocaleString()],
                ['People', people.length ? String(people.length) : '—'],
                ['From', ts(stamps[0] ?? null) ?? 'No timestamps'],
                ['To', ts(stamps[stamps.length - 1] ?? null) ?? '—'],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="font-mono text-[11px] uppercase tracking-wider text-muted">{k}</dt>
                <dd className={`mt-0.5 ${k === 'Messages' || k === 'People' ? 'font-display text-4xl font-black' : 'text-sm font-semibold'}`}>{v}</dd>
              </div>
            ))}
          </dl>

          <div aria-live="polite">
            {status.state === 'running' ? (
              <Pipeline phase={status.phase} count={record.messages.length} />
            ) : status.state === 'error' ? (
              <div role="alert" className="mt-6 rounded-3xl border border-[#c2381f]/30 bg-[#fde3d9] p-5 text-[#8a2310]">
                <p className="font-semibold">Analysis didn’t finish</p>
                <p className="mt-1 text-sm">{status.message}</p>
                <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#8a2310] px-4 py-2 text-sm font-semibold text-white">
                  <RotateCcw className="size-4" aria-hidden /> Retry analysis
                </button>
              </div>
            ) : analysis ? (
              <p className="mt-6 max-w-3xl text-xl leading-relaxed text-ink sm:text-2xl">{unmask(analysis.brief)}</p>
            ) : (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <p className="text-ink-soft">This conversation hasn’t been analyzed yet.</p>
                <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper">
                  <Sparkles className="size-4" aria-hidden /> Analyze with Gemini
                </button>
              </div>
            )}
          </div>
          {analysis?.validationIssues ? (
            <p className="mt-3 font-mono text-[11px] text-muted">
              {analysis.validationIssues} AI claim{analysis.validationIssues === 1 ? '' : 's'} removed or corrected because the cited sources didn’t check out.
            </p>
          ) : null}
        </motion.section>

        {analysis ? (
          <>
            <div className="sticky top-16 z-20 mt-5 flex flex-wrap items-center gap-3 rounded-[24px] border border-ink/10 bg-card/85 p-2 backdrop-blur">
              <div role="group" aria-label="Catch-up depth" className="flex rounded-full bg-paper p-1">
                {(Object.keys(DEPTH_LABEL) as Depth[]).map((d) => (
                  <button key={d} type="button" aria-pressed={depth === d} onClick={() => setDepth(d)} className="relative rounded-full px-3.5 py-1.5 text-sm font-semibold">
                    {depth === d ? <motion.span layoutId={reduced ? undefined : 'depth-pill'} className="absolute inset-0 rounded-full bg-ink" transition={{ type: 'spring', stiffness: 420, damping: 34 }} /> : null}
                    <span className={`relative ${depth === d ? 'text-paper' : 'text-ink-soft'}`}>{DEPTH_LABEL[d]}</span>
                  </button>
                ))}
              </div>
              <div role="group" aria-label="Lens" className="flex flex-wrap gap-1">
                {LENSES.map(([l, label]) => {
                  const disabled = l === 'me' && !record.me
                  return (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={lens === l}
                      disabled={disabled}
                      title={disabled ? (people.length ? 'Choose who you are first' : 'No participant names were detected in this import') : undefined}
                      onClick={() => setLens(l)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${lens === l ? 'border-ink bg-signal text-ink' : 'border-transparent text-ink-soft hover:border-ink/20'}`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <label className="ml-auto flex items-center gap-2 pr-2 text-sm">
                <User className="size-4 text-muted" aria-hidden />
                <span className="sr-only">I am</span>
                <select
                  value={record.me ?? ''}
                  disabled={!people.length}
                  onChange={(e) => onSetMe(e.target.value || null)}
                  className="max-w-[11rem] rounded-full border border-ink/15 bg-card px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  <option value="">{people.length ? 'I am…' : 'No names detected'}</option>
                  {people.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="sr-only" aria-live="polite">
              Focused item urgency: {LEVEL_LABEL[level]}
            </p>

            <LayoutGroup>
              <div className="mt-6 space-y-10">
                {SECTIONS.map((section, si) => {
                  const items = visible.filter((v) => v.section === section)
                  if (!items.length) return null
                  return (
                    <motion.section key={section} layout={!reduced} aria-labelledby={`sec-${section}`}>
                      <h2 id={`sec-${section}`} className="mb-3 flex items-baseline gap-3 px-1">
                        <span className="font-mono text-xs text-muted">{String(si + 1).padStart(2, '0')}</span>
                        <span className="font-display text-3xl font-black uppercase">{SECTION_TITLE[section]}</span>
                        <span className="font-mono text-xs text-muted">{items.length}</span>
                      </h2>
                      <div className={`space-y-3 ${section === 'timeline' ? 'relative border-l-2 border-dashed border-ink/15 pl-4 sm:ml-2' : ''}`}>
                        <AnimatePresence mode="popLayout">
                          {items.map((entry, i) => (
                            <CatchUpCard
                              key={entry.key}
                              ref={(n: HTMLElement | null) => {
                                if (n) nodes.current.set(entry.key, n)
                                else nodes.current.delete(entry.key)
                              }}
                              itemKey={entry.key}
                              index={i}
                              active={activeKey === entry.key && !drawer}
                              urgency={entry.item.urgency}
                              urgencyReason={entry.item.urgencyReason ? unmask(entry.item.urgencyReason) : null}
                              title={unmask(entry.item.text)}
                              {...cardExtras(entry, unmask)}
                              citationIds={entry.item.citationIds}
                              byId={byId}
                              onActivate={activate}
                              onCite={onCite}
                              reduced={reduced}
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </motion.section>
                  )
                })}
                {!visible.length ? (
                  <p className="rounded-[24px] border border-dashed border-ink/20 p-8 text-center text-ink-soft">
                    {lens === 'me' ? 'Nothing in this catch-up mentions you or is assigned to you.' : lens === 'urgent' ? 'Nothing here was assessed as high or critical urgency.' : 'Nothing matches this view.'}
                  </p>
                ) : null}
              </div>
            </LayoutGroup>
            <p className="mt-10 px-1 text-xs leading-relaxed text-muted">
              Summaries, urgency and extraction by Google Gemini ({analysis.model}). Colors show Gemini’s assessment, not guaranteed real-world severity — check the cited messages.
            </p>
          </>
        ) : null}
      </main>

      <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] overflow-hidden rounded-[28px] border border-ink/10 bg-card/85 backdrop-blur xl:block">{ask}</aside>

      <Dialog open={askOpen} onClose={() => setAskOpen(false)} title="Ask" variant="bottom">
        <div className="h-[70vh]">{ask}</div>
      </Dialog>
      <Dialog open={railOpen} onClose={() => setRailOpen(false)} title="Conversations" variant="bottom">
        <div className="pb-6">{rail(() => setRailOpen(false))}</div>
      </Dialog>

      <SourceDrawer
        open={!!drawer}
        onClose={() => setDrawer(null)}
        messages={record.messages}
        citationIds={drawer?.ids ?? []}
        focusId={drawer?.focusId ?? null}
        onFocusId={(id) => setDrawer((d) => (d ? { ...d, focusId: id } : d))}
        urgencies={urgencies}
        reduced={reduced}
      />
    </div>
  )
}

function cardExtras(entry: CatchUpItem, unmask: (s: string) => string): { eyebrow?: string; meta?: Array<[string, string]> } {
  if (entry.section === 'actions') {
    const a = entry.item
    return {
      meta: [
        ['Owner', a.owner ? unmask(a.owner) : 'Not stated'],
        ['Due', a.dueAt ? (ts(a.dueAt) ?? a.dueAt) : 'Not stated'],
        ['Status', a.status === 'unclear' ? 'Unclear' : a.status === 'done' ? 'Done' : 'Open'],
      ],
    }
  }
  if (entry.section === 'timeline') return { eyebrow: [unmask(entry.item.label), ts(entry.item.timestamp)].filter(Boolean).join(' · ') }
  if (entry.section === 'decisions') return { eyebrow: 'Decision' }
  if (entry.section === 'mentions') return { eyebrow: 'Mention / deadline' }
  return {}
}

const PHASES = ['Preparing messages', 'Gemini is reading', 'Linking evidence']

function Pipeline({ phase, count }: { phase: number; count: number }) {
  return (
    <ol className="mt-6 space-y-2" aria-label="Analysis progress">
      {PHASES.map((p, i) => (
        <li key={p} className={`flex items-center gap-3 text-lg transition-opacity ${i > phase ? 'opacity-35' : ''}`}>
          <span className="grid size-7 place-items-center rounded-full border border-ink/15 bg-card">
            {i < phase ? <Check className="size-4" aria-hidden /> : i === phase ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
          </span>
          <span className={i === phase ? 'font-semibold' : ''}>
            {p}
            {i === 1 ? ` ${count.toLocaleString()} messages` : ''}
          </span>
        </li>
      ))}
    </ol>
  )
}
