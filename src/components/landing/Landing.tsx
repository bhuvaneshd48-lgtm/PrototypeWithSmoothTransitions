import { useRef, type ReactNode } from 'react'
import { motion, useMotionValue, useScroll, useSpring, useTransform, useVelocity, type MotionValue } from 'motion/react'
import { ArrowDown, ArrowRight } from 'lucide-react'
import { scrollToTarget } from '@/lib/scroll'

const EASE = [0.22, 1, 0.36, 1] as const

/** Scroll progress (0→1) through a pinned stage. Reduced motion pins it at the resolved end state. */
function useStage(ref: React.RefObject<HTMLElement | null>, reduced: boolean) {
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const smooth = useSpring(scrollYProgress, { stiffness: 170, damping: 32, mass: 0.35 })
  const still = useMotionValue(1)
  return reduced ? still : smooth
}

function Stage({ id, height, reduced, children, className = '', label }: { id: string; height: string; reduced: boolean; children: (p: MotionValue<number>) => ReactNode; className?: string; label: string }) {
  const ref = useRef<HTMLElement>(null)
  const p = useStage(ref, reduced)
  return (
    <section ref={ref} id={id} aria-label={label} className="relative" style={{ height: reduced ? 'auto' : height }}>
      <div className={`${reduced ? 'relative h-[100svh] min-h-[640px]' : 'sticky top-0 h-[100svh]'} overflow-hidden ${className}`}>{children(p)}</div>
    </section>
  )
}

/* ───────────────────────── 01 · The pile → untangled → what matters ───────────────────────── */

type Tag = { label: string; tone: 'critical' | 'high' | 'low' }
/* Abstract message shapes only; no invented senders or content. Bars hint at length. */
const BUBBLES: { bars: [number, number]; side: 'l' | 'r'; tag?: Tag }[] = [
  { bars: [70, 40], side: 'l' },
  { bars: [45, 0], side: 'r' },
  { bars: [88, 62], side: 'l', tag: { label: 'Deadline', tone: 'critical' } },
  { bars: [60, 30], side: 'r' },
  { bars: [80, 0], side: 'l' },
  { bars: [76, 50], side: 'r', tag: { label: 'Decision', tone: 'low' } },
  { bars: [32, 0], side: 'r' },
  { bars: [84, 58], side: 'l', tag: { label: 'You owe', tone: 'high' } },
  { bars: [66, 36], side: 'l' },
]
const TONES = {
  light: {
    critical: { ring: '#b3131b', tint: '#fbd0c9', text: '#7d0a10' },
    high: { ring: '#c2381f', tint: '#fddccf', text: '#8a2310' },
    low: { ring: '#2f7d4a', tint: '#e2f2db', text: '#1d5532' },
  },
  dark: {
    critical: { ring: '#ff2e45', tint: '#3a0a10', text: '#ff9ea8' },
    high: { ring: '#ff6a3d', tint: '#33130b', text: '#ffb49c' },
    low: { ring: '#3dff9a', tint: '#0b2a1e', text: '#8affc4' },
  },
}
const IDLE_RING = 'rgba(127,137,166,0.22)'

// Deterministic scatter so the pile looks the same on every visit.
const rand = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return x - Math.floor(x)
}
const span = (i: number, k: number, r: number) => (rand(i, k) * 2 - 1) * r

function Bubble({ i, p, reduced, dark }: { i: number; p: MotionValue<number>; reduced: boolean; dark: boolean }) {
  const b = BUBBLES[i]
  const TONE = TONES[dark ? 'dark' : 'light']
  const n = BUBBLES.length
  const rank = BUBBLES.filter((x, j) => x.tag && j < i).length
  const important = !!b.tag
  const T = { x: span(i, 1, 300), y: span(i, 2, 190), z: span(i, 3, 260) - 60, rx: span(i, 4, 55), ry: span(i, 5, 60), rz: span(i, 6, 38) }
  const col = { x: b.side === 'l' ? -64 : 64, y: (i - (n - 1) / 2) * 60 }
  const fin = important ? { x: 0, y: (rank - 1) * 112, z: 160, s: 1.16 } : { x: col.x * 1.4, y: col.y * 1.05, z: -320, s: 0.92 }
  const k = [0, 0.1, 0.45, 0.58, 0.82, 1]

  const x = useTransform(p, k, [T.x, T.x, col.x, col.x, fin.x, fin.x])
  const y = useTransform(p, k, [T.y, T.y, col.y, col.y, fin.y, fin.y])
  const z = useTransform(p, k, [T.z, T.z, 0, 0, fin.z, fin.z])
  const rotateX = useTransform(p, k, [T.rx, T.rx, 0, 0, 0, 0])
  const rotateY = useTransform(p, k, [T.ry, T.ry, 0, 0, 0, 0])
  const rotateZ = useTransform(p, k, [T.rz, T.rz, 0, 0, 0, 0])
  const scale = useTransform(p, k, [1, 1, 1, 1, fin.s, fin.s])
  const opacity = useTransform(p, [0.58, 0.8], [1, important ? 1 : 0.14])
  const tagO = useTransform(p, [0.66, 0.8], [0, 1])
  const tagX = useTransform(p, [0.66, 0.8], [-14, 0])
  const ring = useTransform(p, [0.6, 0.8], [IDLE_RING, important ? TONE[b.tag!.tone].ring : IDLE_RING])

  return (
    <motion.div
      className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2"
      style={{ transformStyle: 'preserve-3d' }}
      initial={reduced ? false : { opacity: 0, y: -260 - i * 30, rotate: span(i, 7, 50) }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 70, damping: 14, delay: 0.35 + i * 0.07 }}
    >
      <motion.div style={{ x, y, z, rotateX, rotateY, rotateZ, scale, opacity, transformStyle: 'preserve-3d' }}>
        <motion.div
          className={`bob relative w-[300px] rounded-[22px] border-2 bg-card px-4 py-2.5 shadow-[0_24px_50px_-28px_rgba(18,18,16,0.55)] ${b.side === 'r' ? 'rounded-br-md' : 'rounded-bl-md'}`}
          style={{ borderColor: ring, animationDelay: `${-i * 0.9}s`, boxShadow: dark && important ? `0 0 28px -6px ${TONE[b.tag!.tone].ring}` : undefined }}
        >
          <span className="block h-2 w-14 rounded-full bg-muted/40" />
          <span className="mt-2 block h-3 rounded-full bg-ink/25" style={{ width: `${b.bars[0]}%` }} />
          {b.bars[1] ? <span className="mt-1.5 block h-3 rounded-full bg-ink/15" style={{ width: `${b.bars[1]}%` }} /> : null}
          {b.tag ? (
            <motion.span
              className="absolute -left-3 -top-3 rounded-full px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wider shadow-sm"
              style={{ opacity: tagO, x: tagX, background: TONE[b.tag.tone].tint, color: TONE[b.tag.tone].text, border: `1px solid ${TONE[b.tag.tone].ring}` }}
            >
              {b.tag.label}
            </motion.span>
          ) : null}
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

function Hero({ reduced, dark }: { reduced: boolean; dark: boolean }) {
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 60, damping: 18 })
  const sy = useSpring(my, { stiffness: 60, damping: 18 })

  return (
    <Stage id="intro" height="430vh" reduced={reduced} label="Unread introduction">
      {(p) => <HeroScene p={p} sx={sx} sy={sy} mx={mx} my={my} reduced={reduced} dark={dark} />}
    </Stage>
  )
}

function HeroScene({ p, sx, sy, mx, my, reduced, dark }: { p: MotionValue<number>; sx: MotionValue<number>; sy: MotionValue<number>; mx: MotionValue<number>; my: MotionValue<number>; reduced: boolean; dark: boolean }) {
  const tilt = useTransform(p, [0, 0.45], [20, 0])
  const rotateX = useTransform([tilt, sy], ([t, v]: number[]) => t - v * 7)
  const rotateY = useTransform(sx, (v) => v * 10)
  const rotateZ = useTransform(p, [0, 0.45], [-5, 0])

  const headY = useTransform(p, [0, 0.3], [0, -140])
  const headO = useTransform(p, [0.1, 0.28], [1, 0])
  const headBlur = useTransform(p, [0.1, 0.28], ['blur(0px)', 'blur(14px)'])
  const cueO = useTransform(p, [0, 0.05], [1, 0])

  const metaO = useTransform(p, [0.16, 0.26], [0, 1])
  const metaY = useTransform(p, [0.16, 0.26], [40, 0])
  const sortingO = useTransform(p, [0.55, 0.64], [1, 0])
  const matterO = useTransform(p, [0.64, 0.74], [0, 1])
  const finaleO = useTransform(p, [0.84, 0.94], [0, 1])
  const finaleY = useTransform(p, [0.84, 0.94], [30, 0])

  return (
    <div
      className="relative size-full"
      onPointerMove={(e) => {
        if (reduced || e.pointerType !== 'mouse') return
        mx.set(e.clientX / window.innerWidth - 0.5)
        my.set(e.clientY / window.innerHeight - 0.5)
      }}
    >
      {/* Oversized headline sits behind the pile, then dissolves as the pile untangles. */}
      <motion.h1
        style={reduced ? undefined : { y: headY, opacity: headO, filter: headBlur }}
        className={`${reduced ? 'sr-only' : ''} pointer-events-none absolute inset-x-5 bottom-[12vh] font-display text-[clamp(3.2rem,11.5vw,11rem)] font-black uppercase leading-[0.82] sm:inset-x-8`}
      >
        {['Turn the unread', 'into a clear', 'next move.'].map((line, i) => (
          <span key={line} className="block overflow-hidden pb-[0.04em]">
            <motion.span className="block" initial={reduced ? false : { y: '105%' }} animate={{ y: '0%' }} transition={{ duration: 1.1, delay: 0.1 + i * 0.12, ease: EASE }}>
              {i === 2 ? <span className="relative inline-block"><span className="absolute inset-x-[-0.05em] bottom-[0.06em] top-[0.5em] -z-10 bg-signal" aria-hidden />{line}</span> : line}
            </motion.span>
          </span>
        ))}
      </motion.h1>

      {/* The 3D pile */}
      <div className="absolute inset-0 grid place-items-center" aria-hidden>
        <div className="scale-[0.6] sm:scale-[0.8] lg:translate-x-[8vw] lg:scale-[0.92] xl:scale-100" style={{ perspective: 1500 }}>
          <motion.div className="relative size-0" style={{ rotateX, rotateY, rotateZ, transformStyle: 'preserve-3d' }}>
            {BUBBLES.map((_, i) => (
              <Bubble key={i} i={i} p={p} reduced={reduced} dark={dark} />
            ))}
          </motion.div>
        </div>
      </div>

      {/* Counter caption */}
      <motion.div style={{ opacity: metaO, y: metaY }} className="pointer-events-none absolute left-5 top-24 sm:left-8 lg:top-1/2 lg:-translate-y-1/2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Your unread pile</p>
        <p className="font-display text-[clamp(3.5rem,9vw,8.5rem)] font-black uppercase leading-[0.82]">Every<br />message</p>
        <div className="relative mt-3 h-8 text-lg font-medium sm:text-xl">
          <motion.span style={{ opacity: sortingO }} className="absolute left-0 whitespace-nowrap text-ink-soft">Sorting the pile…</motion.span>
          <motion.span style={{ opacity: matterO }} className="absolute left-0 whitespace-nowrap">down to what needs you.</motion.span>
        </div>
      </motion.div>

      {/* Chapter rail */}
      <ChapterRail p={p} />

      {/* Finale + skip */}
      <motion.div style={{ opacity: finaleO, y: finaleY }} className="absolute bottom-[8vh] left-5 max-w-sm sm:left-8">
        <p className="text-lg leading-relaxed text-ink-soft">Deadlines, decisions and what you owe — each one linked back to the exact message it came from.</p>
      </motion.div>
      <motion.button
        type="button"
        style={{ opacity: cueO }}
        onClick={() => scrollToTarget('#import', { offset: -72 })}
        className="absolute bottom-6 right-5 inline-flex items-center gap-2 rounded-full border border-ink/15 bg-card/70 px-4 py-2 text-sm font-medium backdrop-blur transition hover:border-ink sm:right-8"
      >
        Skip to import <ArrowRight className="size-4" aria-hidden />
      </motion.button>
      {!reduced ? (
        <motion.p style={{ opacity: cueO }} className="pointer-events-none absolute left-1/2 top-24 flex -translate-x-1/2 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted" aria-hidden>
          <ArrowDown className="size-3.5 animate-bounce" /> Scroll to untangle
        </motion.p>
      ) : null}
    </div>
  )
}

function ChapterRail({ p }: { p: MotionValue<number> }) {
  const fill = useTransform(p, [0, 1], [0, 1])
  const steps = [
    { n: '01', label: 'The pile', r: [0, 0.12, 0.2] },
    { n: '02', label: 'Untangle', r: [0.12, 0.3, 0.58] },
    { n: '03', label: 'What matters', r: [0.58, 0.72, 1] },
  ]
  return (
    <div className="pointer-events-none absolute right-8 top-1/2 hidden -translate-y-1/2 items-stretch gap-4 lg:flex" aria-hidden>
      <div className="flex flex-col justify-between gap-10 py-1 text-right">
        {steps.map((s) => (
          <RailStep key={s.n} p={p} {...s} />
        ))}
      </div>
      <div className="relative w-px bg-ink/15">
        <motion.div className="absolute inset-x-0 top-0 h-full origin-top bg-ink" style={{ scaleY: fill }} />
      </div>
    </div>
  )
}
function RailStep({ p, n, label, r }: { p: MotionValue<number>; n: string; label: string; r: number[] }) {
  const opacity = useTransform(p, [r[0] - 0.04, r[1], r[2], r[2] + 0.04], [0.3, 1, 1, 0.3])
  return (
    <motion.p style={{ opacity }} className="font-mono text-[11px] uppercase tracking-[0.2em]">
      <span className="text-muted">{n}</span> {label}
    </motion.p>
  )
}

/* ───────────────────────── Marquee driven by scroll + velocity ───────────────────────── */

function Marquee({ reduced }: { reduced: boolean }) {
  const { scrollY } = useScroll()
  const vel = useSpring(useVelocity(scrollY), { stiffness: 120, damping: 40 })
  const x = useTransform(scrollY, (v) => `${-((v * 0.025) % 50)}%`)
  const skew = useTransform(vel, [-2500, 0, 2500], [8, 0, -8])
  const items = ['WhatsApp .zip', '.txt', '.json', 'Screenshots', 'PDF', 'Share to Unread']
  const row = [...items, ...items]
  return (
    <div className="relative overflow-hidden border-y border-ink/10 bg-ink py-6 text-paper" aria-hidden>
      <motion.div className="flex w-max gap-10 whitespace-nowrap" style={reduced ? undefined : { x, skewX: skew }}>
        {[...row, ...row].map((t, i) => (
          <span key={i} className="flex items-center gap-10 font-display text-[clamp(2.5rem,6vw,5.5rem)] font-black uppercase leading-none">
            {t}
            <span className="size-3 rounded-full bg-signal" />
          </span>
        ))}
      </motion.div>
    </div>
  )
}

/* ───────────────────────── 02 · Privacy mask ───────────────────────── */

type Tok = { t: string } | { pii: string; ph: string }
const SENTENCE: Tok[] = [
  { t: 'Your' }, { t: 'chat' }, { t: 'holds' }, { pii: 'email addresses', ph: '[EMAIL_1]' }, { t: ',' }, { pii: 'phone numbers', ph: '[PHONE_1]' },
  { t: 'and' }, { pii: 'private names', ph: '[TERM_1]' }, { t: '—' }, { t: 'Gemini' }, { t: 'only' }, { t: 'ever' }, { t: 'sees' }, { t: 'the' }, { t: 'tags.' },
]

function Word({ p, range, children }: { p: MotionValue<number>; range: [number, number]; children: ReactNode }) {
  const opacity = useTransform(p, range, [0.1, 1])
  const y = useTransform(p, range, [18, 0])
  return <motion.span style={{ opacity, y }} className="inline-block">{children}</motion.span>
}

function Pii({ p, range, from, to }: { p: MotionValue<number>; range: [number, number]; from: string; to: string }) {
  const outO = useTransform(p, range, [1, 0])
  const outY = useTransform(p, range, ['0%', '-70%'])
  const outBlur = useTransform(p, range, ['blur(0px)', 'blur(8px)'])
  const inO = useTransform(p, range, [0, 1])
  const inY = useTransform(p, range, ['70%', '0%'])
  const sweep = useTransform(p, range, [0, 1])
  return (
    <span className="relative inline-grid overflow-hidden px-[0.08em] align-bottom">
      <motion.span className="absolute inset-0 origin-left rounded-[0.18em] bg-signal" style={{ scaleX: sweep }} aria-hidden />
      <motion.span style={{ opacity: outO, y: outY, filter: outBlur }} className="relative whitespace-nowrap text-[#ff4d5e] [grid-area:1/1]">{from}</motion.span>
      <motion.span style={{ opacity: inO, y: inY }} className="relative whitespace-nowrap font-mono text-[0.78em] font-medium [grid-area:1/1] self-center">{to}</motion.span>
    </span>
  )
}

function PrivacyChapter({ reduced }: { reduced: boolean }) {
  return (
    <Stage id="privacy" height="280vh" reduced={reduced} label="Privacy mask" className="grid place-items-center">
      {(p) => <PrivacyScene p={p} />}
    </Stage>
  )
}
function PrivacyScene({ p }: { p: MotionValue<number> }) {
  const words = SENTENCE.length
  let piiIndex = 0
  const noteO = useTransform(p, [0.84, 0.94], [0, 1])
  const noteY = useTransform(p, [0.84, 0.94], [24, 0])
  return (
    <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
      <p className="mb-8 font-mono text-xs uppercase tracking-[0.2em] text-muted">02 — Masked on your device</p>
      <p className="font-display text-[clamp(2rem,5.4vw,5rem)] font-extrabold leading-[1.02] tracking-tight [font-stretch:85%]">
        {SENTENCE.map((tok, i) => {
          const range: [number, number] = [0.02 + (i / words) * 0.4, 0.06 + (i / words) * 0.4]
          if ('t' in tok) return <span key={i}><Word p={p} range={range}>{tok.t}</Word>{' '}</span>
          const k = piiIndex++
          const mask: [number, number] = [0.52 + k * 0.1, 0.6 + k * 0.1]
          return (
            <span key={i}>
              <Word p={p} range={range}>
                <Pii p={p} range={mask} from={tok.pii} to={tok.ph} />
              </Word>{' '}
            </span>
          )
        })}
      </p>
      <motion.div style={{ opacity: noteO, y: noteY }} className="mt-12 grid max-w-3xl gap-6 sm:grid-cols-2">
        <p className="text-lg leading-relaxed text-ink-soft">Only this masked version is sent to Gemini. The originals are swapped back in locally — they never leave this browser.</p>
        <p className="font-mono text-xs uppercase leading-relaxed tracking-wider text-muted">Emails &amp; phone numbers masked by default · add your own terms · history stays on this device</p>
      </motion.div>
    </div>
  )
}

/* ───────────────────────── 03 · Ambient urgency ───────────────────────── */

const LEVEL_TEXT = [
  { name: 'Low', line: 'Nothing needs you yet. Catch up whenever.' },
  { name: 'Medium', line: 'A decision is forming. Weigh in soon.' },
  { name: 'High', line: 'Someone is waiting on you.' },
  { name: 'Critical', line: 'A deadline is close. Act now.' },
]
const LEVEL_COLORS = {
  light: [['#f7f6f0', '#cdeec6', '#1d5532'], ['#fbf4e4', '#ffd27a', '#6f3d00'], ['#fbeee7', '#ff8d6e', '#8a2310'], ['#f9e5df', '#e5232d', '#7d0a10']],
  dark: [['#05080a', '#0c5b3a', '#3dff9a'], ['#0b0906', '#7a4a00', '#ffb52e'], ['#0d0706', '#8a2410', '#ff6a3d'], ['#100507', '#b3101b', '#ff2e45']],
}
const levels = (dark: boolean) => LEVEL_TEXT.map((l, i) => { const [base, wash, ink] = LEVEL_COLORS[dark ? 'dark' : 'light'][i]; return { ...l, base, wash, ink } })
const STOPS = [0, 0.14, 0.28, 0.4, 0.54, 0.66, 0.8, 1]
const plateau = <T,>(vals: T[]) => [vals[0], vals[0], vals[1], vals[1], vals[2], vals[2], vals[3], vals[3]]

function UrgencyChapter({ reduced, dark }: { reduced: boolean; dark: boolean }) {
  return (
    <Stage id="urgency" height="340vh" reduced={reduced} label="Ambient urgency">
      {(p) => <UrgencyScene key={dark ? 'd' : 'l'} p={p} dark={dark} />}
    </Stage>
  )
}
function UrgencyScene({ p, dark }: { p: MotionValue<number>; dark: boolean }) {
  const LEVELS = levels(dark)
  const bg = useTransform(p, STOPS, plateau(LEVELS.map((l) => l.base)))
  const wash = useTransform(p, STOPS, plateau(LEVELS.map((l) => l.wash)))
  const ink = useTransform(p, STOPS, plateau(LEVELS.map((l) => l.ink)))
  const orb = useTransform(wash, (c) => `radial-gradient(closest-side, ${c}, transparent)`)
  const orbScale = useTransform(p, [0, 1], [0.7, 1.35])
  const slot = useTransform(p, STOPS, plateau(['0%', '-25%', '-50%', '-75%']))

  return (
    <motion.div className="relative size-full" style={{ background: bg }}>
      <motion.div className="urgency-orb absolute left-1/2 top-1/2 size-[120vmax] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: orb, scale: orbScale }} aria-hidden />
      <div className="relative mx-auto flex h-full max-w-[1500px] flex-col justify-between px-5 pb-12 pt-24 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">03 — Ambient urgency</p>
            <motion.h2 style={{ color: ink }} className="mt-4 max-w-2xl font-display text-[clamp(2rem,4.5vw,4rem)] font-extrabold uppercase leading-[0.92]">The whole room reads the stakes.</motion.h2>
          </div>
          <p className="max-w-xs text-base leading-relaxed text-ink-soft">Focus any catch-up item and the background shifts with how urgent it is — calm green to radiant red.</p>
        </div>

        <div>
          <motion.div style={{ color: ink }} className="h-[0.86em] overflow-hidden font-display text-[clamp(4.5rem,19vw,17rem)] font-black uppercase leading-[0.86]" aria-hidden>
            <motion.div style={{ y: slot }}>
              {LEVELS.map((l) => (
                <p key={l.name} className="h-[0.86em]">{l.name}</p>
              ))}
            </motion.div>
          </motion.div>
          <div className="relative mt-6 h-8">
            {LEVELS.map((l, i) => (
              <LevelLine key={l.name} p={p} i={i} text={l.line} color={l.ink} />
            ))}
          </div>
          <ul className="sr-only">
            {LEVELS.map((l) => <li key={l.name}>{l.name}: {l.line}</li>)}
          </ul>
        </div>
      </div>
    </motion.div>
  )
}
function LevelLine({ p, i, text, color }: { p: MotionValue<number>; i: number; text: string; color: string }) {
  const a = STOPS[i * 2]
  const b = STOPS[i * 2 + 1]
  const opacity = useTransform(p, [a - 0.05, a + 0.02, b + 0.06, b + 0.12], i === 0 ? [1, 1, 1, 0] : i === 3 ? [0, 1, 1, 1] : [0, 1, 1, 0])
  const y = useTransform(p, [a - 0.05, a + 0.02], i === 0 ? [0, 0] : [16, 0])
  return <motion.p aria-hidden style={{ opacity, y, color }} className="absolute left-0 text-xl font-semibold sm:text-2xl">{text}</motion.p>
}

/* ───────────────────────── Landing ───────────────────────── */

export default function Landing({ reduced, dark = true }: { reduced: boolean; dark?: boolean }) {
  return (
    <div className="relative z-10 -mt-20">
      <Hero key={dark ? 'd' : 'l'} reduced={reduced} dark={dark} />
      <Marquee reduced={reduced} />
      <PrivacyChapter reduced={reduced} />
      <UrgencyChapter reduced={reduced} dark={dark} />
    </div>
  )
}
