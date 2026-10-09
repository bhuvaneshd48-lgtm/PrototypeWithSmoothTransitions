import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowLeft, ArrowRight, Eye, Plus, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import type { ChatMessage, PrivacySettings, SourceType } from '@/types'
import { LIMITS, participants, reindex } from '@/lib/parsers'
import { DEFAULT_PRIVACY, maskMessages } from '@/lib/privacy'

export type Draft = {
  messages: ChatMessage[]
  skipped: number
  notes: string[]
  sourceType: SourceType
  title: string
  transcribed: boolean
  warnings: string[]
}

type Props = {
  draft: Draft
  onBack: () => void
  onConfirm: (input: { messages: ChatMessage[]; privacy: PrivacySettings; title: string }) => void
  backendReady: boolean
}

function formatTs(ts: string | null) {
  if (!ts) return null
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ReviewPanel({ draft, onBack, onConfirm, backendReady }: Props) {
  const total = draft.messages.length
  const oversized = total > LIMITS.maxMessages
  const [title, setTitle] = useState(draft.title)
  const [from, setFrom] = useState(oversized ? total - LIMITS.maxMessages + 1 : 1)
  const [privacy, setPrivacy] = useState<PrivacySettings>(DEFAULT_PRIVACY)
  const [term, setTerm] = useState('')
  const [view, setView] = useState<'original' | 'prepared'>('prepared')
  const [consent, setConsent] = useState(false)

  const selected = useMemo(() => {
    const start = Math.max(0, Math.min(total - 1, from - 1))
    return reindex(draft.messages.slice(start, start + LIMITS.maxMessages))
  }, [draft.messages, from, total])
  const masked = useMemo(() => maskMessages(selected, privacy), [selected, privacy])
  const chars = useMemo(() => masked.prepared.reduce((n, m) => n + m.text.length + (m.sender?.length ?? 0), 0), [masked])
  const people = useMemo(() => participants(selected), [selected])
  const stamps = selected.map((m) => m.timestamp).filter(Boolean) as string[]
  const tooLong = chars > LIMITS.maxChars

  const changed = useMemo(() => masked.prepared.map((m, i) => ({ m, o: selected[i] })).filter(({ m, o }) => m.text !== o.text || m.sender !== o.sender), [masked, selected])
  const previewRows = (view === 'prepared' && changed.length ? changed : masked.prepared.map((m, i) => ({ m, o: selected[i] }))).slice(0, 80)

  const addTerm = () => {
    const t = term.trim()
    if (t.length >= 2 && !privacy.customTerms.includes(t)) setPrivacy((p) => ({ ...p, customTerms: [...p.customTerms, t] }))
    setTerm('')
  }

  const stats: Array<[string, string]> = [
    ['Messages', selected.length.toLocaleString()],
    ['Participants', people.length ? String(people.length) : 'Not detected'],
    ['Time span', stamps.length ? `${formatTs(stamps[0])} → ${formatTs(stamps[stamps.length - 1])}` : 'No timestamps'],
    ['Skipped rows', String(draft.skipped)],
  ]

  return (
    <motion.section
      className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-24 pt-4 sm:px-8"
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      aria-labelledby="review-title"
    >
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-ink-soft hover:bg-card">
        <ArrowLeft className="size-4" aria-hidden /> Back to import
      </button>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted">Step 2 of 3 · Review before anything leaves this browser</p>
          <h1 id="review-title" className="mt-2 font-display text-[clamp(2.6rem,6vw,5rem)] font-black uppercase leading-[0.88]">
            Check the import
          </h1>
        </div>
        <label className="w-full max-w-sm">
          <span className="font-mono text-xs uppercase tracking-wider text-muted">Name (saved on this device)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className="mt-1 w-full rounded-2xl border border-ink/15 bg-card px-4 py-3 text-base outline-none focus:border-ink" />
        </label>
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-ink/10 bg-ink/10 lg:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k} className="bg-card px-5 py-4">
            <dt className="font-mono text-[11px] uppercase tracking-wider text-muted">{k}</dt>
            <dd className="mt-1 text-lg font-semibold leading-snug">{v}</dd>
          </div>
        ))}
      </dl>

      {draft.transcribed || draft.notes.length || draft.warnings.length ? (
        <div className="mt-4 space-y-2">
          {draft.transcribed ? (
            <p className="flex items-start gap-2 rounded-2xl border border-[#a35a00]/30 bg-[#fdeac0] px-4 py-3 text-sm text-[#6f3d00]">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> Transcribed by Gemini — check for errors before analysis.
            </p>
          ) : null}
          {[...draft.warnings, ...draft.notes].map((n) => (
            <p key={n} className="rounded-2xl bg-card/70 px-4 py-2.5 text-sm text-ink-soft">
              {n}
            </p>
          ))}
        </div>
      ) : null}

      {oversized ? (
        <fieldset className="mt-4 rounded-3xl border-2 border-ink bg-card p-5">
          <legend className="px-2 font-semibold">Choose a range</legend>
          <p className="text-sm text-ink-soft">
            This chat has {total.toLocaleString()} messages. One analysis covers up to {LIMITS.maxMessages.toLocaleString()}. Pick where to start — nothing is dropped without your choice.
          </p>
          <label className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            Start at message
            <input type="number" min={1} max={total} value={from} onChange={(e) => setFrom(Math.max(1, Math.min(total, Number(e.target.value) || 1)))} className="w-28 rounded-xl border border-ink/20 px-3 py-2" />
            <span className="text-muted">
              → analyzing {from.toLocaleString()}–{Math.min(total, from + LIMITS.maxMessages - 1).toLocaleString()}
            </span>
          </label>
        </fieldset>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
        <fieldset className="rounded-[28px] border border-ink/10 bg-card p-5">
          <legend className="sr-only">Privacy Mask</legend>
          <h2 className="flex items-center gap-2 font-display text-2xl font-extrabold uppercase">
            <ShieldCheck className="size-5" aria-hidden /> Privacy Mask
          </h2>
          <p className="mt-1 text-sm text-ink-soft">Runs locally. Masked values become placeholders; the key to restore them never leaves this browser.</p>
          <div className="mt-4 space-y-2">
            {(
              [
                ['email', 'Email addresses', masked.counts.EMAIL],
                ['phone', 'Phone numbers', masked.counts.PHONE],
                ['url', 'Links', masked.counts.URL],
              ] as const
            ).map(([key, label, count]) => (
              <label key={key} className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 has-[:checked]:border-ink">
                <span className="text-sm font-medium">{label}</span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted">{privacy[key] ? `${count} masked` : 'off'}</span>
                  <input type="checkbox" className="size-4 accent-ink" checked={privacy[key]} onChange={(e) => setPrivacy((p) => ({ ...p, [key]: e.target.checked }))} />
                </span>
              </label>
            ))}
          </div>
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault()
              addTerm()
            }}
          >
            <label htmlFor="term" className="text-sm font-medium">
              Custom terms <span className="font-normal text-muted">(names, places, IDs)</span>
            </label>
            <div className="mt-1.5 flex gap-2">
              <input id="term" value={term} onChange={(e) => setTerm(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-ink/15 px-3 py-2 text-sm outline-none focus:border-ink" placeholder="e.g. a surname" />
              <button type="submit" disabled={term.trim().length < 2} className="grid size-10 place-items-center rounded-xl bg-ink text-paper disabled:opacity-30" aria-label="Add custom term">
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
            {privacy.customTerms.length ? (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {privacy.customTerms.map((t) => (
                  <li key={t}>
                    <button type="button" onClick={() => setPrivacy((p) => ({ ...p, customTerms: p.customTerms.filter((x) => x !== t) }))} className="inline-flex items-center gap-1 rounded-full bg-paper px-3 py-1 text-xs font-medium hover:bg-line" aria-label={`Remove ${t}`}>
                      {t} <X className="size-3" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 font-mono text-xs text-muted">{masked.counts.TERM} custom matches masked</p>
          </form>
        </fieldset>

        <div className="flex min-h-0 flex-col rounded-[28px] border border-ink/10 bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Eye className="size-4" aria-hidden /> {view === 'prepared' ? (changed.length ? `${changed.length} messages changed by the mask` : 'Exactly what Gemini will receive') : 'Original messages'}
            </h2>
            <div role="group" aria-label="Preview mode" className="flex rounded-full bg-paper p-1 text-xs font-semibold">
              {(['prepared', 'original'] as const).map((v) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-full px-3 py-1.5 transition ${view === v ? 'bg-ink text-paper' : 'text-ink-soft'}`}>
                  {v === 'prepared' ? 'Prepared' : 'Original'}
                </button>
              ))}
            </div>
          </div>
          <ol className="scrollbar-thin max-h-[440px] divide-y divide-line overflow-y-auto">
            {previewRows.map(({ m, o }) => {
              const shown = view === 'prepared' ? m : o
              return (
                <li key={m.id} className="grid grid-cols-[52px_1fr] gap-3 px-5 py-3 text-sm">
                  <span className="pt-0.5 font-mono text-[11px] text-muted">{m.id}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink-soft">
                      {shown.sender ?? 'Unknown sender'}
                      {shown.timestamp ? <span className="ml-2 font-mono font-normal text-muted">{formatTs(shown.timestamp)}</span> : null}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words leading-relaxed">{shown.text}</p>
                  </div>
                </li>
              )
            })}
          </ol>
          {selected.length > previewRows.length ? <p className="border-t border-line px-5 py-2 font-mono text-xs text-muted">Showing {previewRows.length} of {view === 'prepared' && changed.length ? changed.length : selected.length}</p> : null}
        </div>
      </div>

      <div className="sticky bottom-4 z-20 mt-8 flex flex-wrap items-center gap-4 rounded-[28px] border-2 border-ink bg-card/95 p-4 shadow-xl backdrop-blur sm:p-5">
        <label className="flex flex-1 cursor-pointer items-start gap-3 text-sm leading-relaxed">
          <input type="checkbox" className="mt-1 size-4 accent-ink" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            <strong>Send this prepared text to Gemini.</strong> {selected.length.toLocaleString()} messages · {chars.toLocaleString()} characters, via a secured Supabase function. Not stored on the server.
          </span>
        </label>
        <button
          type="button"
          disabled={!consent || !selected.length || tooLong || !backendReady}
          onClick={() => onConfirm({ messages: selected, privacy, title: title.trim() || draft.title })}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 font-semibold text-paper transition hover:bg-ink-soft active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35"
        >
          Analyze with Gemini <ArrowRight className="size-4" aria-hidden />
        </button>
        {tooLong ? <p className="w-full text-sm text-[#8a2310]">Too much text for one analysis ({LIMITS.maxChars.toLocaleString()} characters max). Start the range later.</p> : null}
        {!backendReady ? <p className="w-full text-sm text-muted">The Gemini backend is not connected yet, so analysis is unavailable. Your import is kept while you set it up.</p> : null}
      </div>
    </motion.section>
  )
}
