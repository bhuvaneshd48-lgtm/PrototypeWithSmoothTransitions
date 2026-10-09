import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, FileUp, Image as ImageIcon, LoaderCircle, Lock, ShieldCheck, Smartphone, X } from 'lucide-react'
import { parseText } from '@/lib/parsers'

type Props = {
  onPaste: (text: string) => void
  onFiles: (files: File[]) => void
  error: string | null
  visionFiles: File[] | null
  visionBusy: boolean
  onVisionConsent: () => void
  onVisionCancel: () => void
  backendReady: boolean
  intro?: boolean
}

const EASE = [0.22, 1, 0.36, 1] as const
const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 48, filter: 'blur(8px)' },
  whileInView: { opacity: 1, y: 0, filter: 'blur(0px)' },
  viewport: { once: true, amount: 0.3 },
  transition: { duration: 1, delay, ease: EASE },
})

const ACCEPT = '.txt,.json,.zip,.png,.jpg,.jpeg,.webp,.pdf,text/plain,application/json,application/zip,image/png,image/jpeg,image/webp,application/pdf'

export default function ImportPanel({ onPaste, onFiles, error, visionFiles, visionBusy, onVisionConsent, onVisionCancel, backendReady, intro = false }: Props) {
  const Heading = intro ? 'h2' : 'h1'
  const [text, setText] = useState('')
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const deferred = useDeferredValue(text)
  const estimate = useMemo(() => (deferred.trim() ? parseText(deferred) : null), [deferred])

  return (
    <motion.section id="import" layout className="relative z-10 mx-auto w-full max-w-6xl scroll-mt-20 px-5 pb-24 pt-6 sm:px-8" transition={{ duration: 0.5, ease: EASE }}>
      {intro ? (
        <motion.p {...reveal()} className="pt-24 font-mono text-xs uppercase tracking-[0.2em] text-muted">
          04 — Your turn
        </motion.p>
      ) : null}
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <div className="pt-6 lg:pt-14">
          <motion.p {...reveal()} className="mb-6 inline-flex items-center gap-2 rounded-full border border-ink/15 bg-card/70 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-ink-soft">
            <span className="size-1.5 rounded-full bg-[#2f7d4a]" aria-hidden /> For students & project teams
          </motion.p>
          <Heading className="font-display text-[clamp(3.4rem,9vw,8.2rem)] font-black uppercase leading-[0.84]">
            {(intro ? ['Bring the', 'chat you', 'fell behind', 'on.'] : ['Turn the', 'unread into', 'a clear', 'next move.']).map((line, i) => (
              <span key={line} className="block overflow-hidden pb-[0.04em]">
                <motion.span
                  className="block"
                  initial={{ y: '105%' }}
                  {...(intro ? { whileInView: { y: '0%' }, viewport: { once: true, amount: 0.6 } } : { animate: { y: '0%' } })}
                  transition={{ delay: 0.08 * i, duration: 1, ease: EASE }}
                >
                  {i >= 2 ? (
                    <span className="relative inline-block">
                      <span className="absolute inset-x-[-0.06em] bottom-[0.08em] top-[0.52em] -z-10 bg-signal" aria-hidden />
                      {line}
                    </span>
                  ) : (
                    line
                  )}
                </motion.span>
              </span>
            ))}
          </Heading>
          <motion.p {...reveal(0.15)} className="mt-8 max-w-md text-lg leading-relaxed text-ink-soft">
            Paste or import the group chat you fell behind on. Unread finds what needs you first, what was decided, and who owes what — every claim linked to the original message.
          </motion.p>

          <motion.aside {...reveal(0.25)} aria-labelledby="data-handling" className="mt-10 max-w-md rounded-3xl border border-ink/10 bg-card/70 p-5 backdrop-blur">
            <h2 id="data-handling" className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="size-4" aria-hidden /> How your data is handled
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-ink-soft">
              <li>Parsing, privacy masking and history happen in this browser. History is saved on this device only.</li>
              <li>Nothing is sent until you confirm. Then only the prepared (masked) messages go to Google Gemini through a secured Supabase function.</li>
              <li>Chats are not stored on the server. Please avoid importing highly sensitive or regulated personal data.</li>
            </ul>
          </motion.aside>
        </div>

        <motion.div className="lg:pt-10" initial={{ opacity: 0, y: 80, scale: 0.94, rotateX: 12 }} whileInView={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 1.2, delay: 0.1, ease: EASE }} style={{ transformPerspective: 1200 }}>
          <div
            className={`relative overflow-hidden rounded-[32px] border-2 bg-card shadow-[0_30px_80px_-40px_rgba(18,18,16,0.45)] transition-colors ${dragging ? 'border-ink' : 'border-ink/10'}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files])
            }}
          >
            <AnimatePresence>
              {dragging ? (
                <motion.div className="absolute inset-0 z-10 grid place-items-center bg-signal/90" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <p className="font-display text-4xl font-black uppercase">Drop to import</p>
                </motion.div>
              ) : null}
            </AnimatePresence>
            <label htmlFor="paste" className="flex items-baseline justify-between px-6 pt-5">
              <span className="font-display text-2xl font-extrabold uppercase">Paste the chat</span>
              <span className="font-mono text-xs text-muted" aria-live="polite">
                {text ? `${text.length.toLocaleString()} chars · ~${estimate?.messages.length ?? 0} messages` : 'Nothing pasted yet'}
              </span>
            </label>
            <textarea
              id="paste"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste a WhatsApp export, or lines like “Name: message”…"
              className="scrollbar-thin mt-3 block h-64 w-full resize-none bg-transparent px-6 font-mono text-[13px] leading-relaxed outline-none placeholder:text-muted/70 focus-visible:outline-none"
            />
            <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-4 sm:px-5">
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2.5 text-sm font-medium transition hover:border-ink active:scale-[0.97]"
              >
                <FileUp className="size-4" aria-hidden /> Import file
              </button>
              <input
                ref={input}
                type="file"
                accept={ACCEPT}
                multiple
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  if (e.target.files?.length) onFiles([...e.target.files])
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                disabled={!estimate?.messages.length}
                onClick={() => onPaste(text)}
                className="ml-auto inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-ink-soft active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35"
              >
                Review import <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          </div>
          <p className="mt-4 px-2 text-sm leading-relaxed text-muted">
            Accepts <strong className="font-medium text-ink-soft">.txt</strong>, <strong className="font-medium text-ink-soft">.json</strong> and WhatsApp <strong className="font-medium text-ink-soft">.zip</strong> exports, or up to 10 screenshots / 1 PDF (read by Gemini Vision).
          </p>
          <p className="mt-2 flex items-start gap-2 px-2 text-sm leading-relaxed text-muted">
            <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>On Android, install Unread and use WhatsApp → Export chat → Share → Unread. On iPhone, export to Files, then import the file here.</span>
          </p>

          <div role="alert" aria-live="assertive">
            {error ? <p className="mt-5 rounded-2xl border border-[#c2381f]/30 bg-[#fde3d9] px-4 py-3 text-sm text-[#8a2310]">{error}</p> : null}
          </div>

          <AnimatePresence>
            {visionFiles ? (
              <VisionConsent files={visionFiles} busy={visionBusy} onConsent={onVisionConsent} onCancel={onVisionCancel} backendReady={backendReady} />
            ) : null}
          </AnimatePresence>
        </motion.div>
      </div>
    </motion.section>
  )
}

function VisionConsent({ files, busy, onConsent, onCancel, backendReady }: { files: File[]; busy: boolean; onConsent: () => void; onCancel: () => void; backendReady: boolean }) {
  const urls = useMemo(() => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)), [files])
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls])
  return (
    <motion.section aria-labelledby="vision-title" className="mt-6 rounded-[28px] border-2 border-ink bg-card p-5" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
      <div className="flex items-start justify-between gap-3">
        <h2 id="vision-title" className="flex items-center gap-2 font-display text-xl font-extrabold uppercase">
          <ImageIcon className="size-5" aria-hidden /> Read {files.length} file{files.length === 1 ? '' : 's'} with Gemini
        </h2>
        <button type="button" onClick={onCancel} disabled={busy} aria-label="Cancel file reading" className="grid size-9 place-items-center rounded-full hover:bg-paper">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <ul className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {files.map((f, i) => (
          <li key={f.name + i} className="h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-line bg-paper">
            {urls[i] ? <img src={urls[i]!} alt={`Preview of ${f.name}`} className="size-full object-cover" /> : <span className="grid size-full place-items-center p-2 text-center font-mono text-[10px] text-muted">{f.name}</span>}
          </li>
        ))}
      </ul>
      <p className="mt-4 flex gap-2 text-sm leading-relaxed text-ink-soft">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
        These files will be sent to Gemini to read the messages. Pixels can’t be masked first — Privacy Mask applies to the transcribed text afterward. The files themselves are not saved.
      </p>
      <button
        type="button"
        onClick={onConsent}
        disabled={busy || !backendReady}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition active:scale-[0.97] disabled:opacity-40"
      >
        {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
        {busy ? 'Gemini is reading…' : 'Send these files to Gemini'}
      </button>
      {!backendReady ? <p className="mt-2 text-xs text-muted">Available once the Gemini backend is connected.</p> : null}
    </motion.section>
  )
}
