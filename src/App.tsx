import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { ArrowLeft, HardDrive, Languages, Moon, Settings, Sparkles, Sun } from 'lucide-react'
import type { AskAnswer, ConversationRecord, ParseResult, SourceType, UrgencyLevel } from '@/types'
import { fileKind, ImportError, parseFile, parseText, participants, reindex } from '@/lib/parsers'
import { createRepository, consumeShareInbox, sharedItemToFile, type ConversationRepository } from '@/lib/storage'
import { maskMessages, toPayload, unmask } from '@/lib/privacy'
import { findSinceLast, inRange } from '@/lib/range'
import { backendConfigured, LANGUAGES, getLanguage, setLanguage, callGemini, errorMessage, ApiError } from '@/lib/api'
import { validateAnalysis, validateAnswer, validateExtract } from '@/lib/validate'
import { checkVisionSelection, prepareVisionParts } from '@/lib/vision'
import ImportPanel from '@/components/ImportPanel'
import Landing from '@/components/landing/Landing'
import Curtain from '@/components/Curtain'
import { scrollToTarget, startSmoothScroll, stopSmoothScroll } from '@/lib/scroll'
import type { Draft } from '@/components/ReviewPanel'
import type { AnalysisStatus } from '@/components/Workspace'
import ConversationRail from '@/components/ConversationRail'
import type { Preferences } from '@/components/SettingsDialog'

// Screens not needed for the first paint are split into their own chunks.
const ReviewPanel = lazy(() => import('@/components/ReviewPanel'))
const Workspace = lazy(() => import('@/components/Workspace'))
const SettingsDialog = lazy(() => import('@/components/SettingsDialog'))

type View = 'import' | 'review' | 'workspace'
type InstallPrompt = Event & { prompt: () => Promise<void> }

const PREFS_KEY = 'unread-prefs'

function loadPrefs(): Preferences {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Preferences>
    return { ambient: p.ambient !== false, motion: p.motion === 'reduced' ? 'reduced' : 'auto', theme: p.theme === 'light' ? 'light' : 'dark' }
  } catch {
    return { ambient: true, motion: 'auto', theme: 'dark' }
  }
}

function defaultTitle(result: ParseResult, fileName: string | null) {
  if (fileName) return fileName.replace(/\.(txt|json|zip|pdf|png|jpe?g|webp)$/i, '').replace(/^WhatsApp Chat (with|-)\s*/i, '').slice(0, 80) || 'Imported chat'
  const people = participants(result.messages)
  if (people.length) return `Chat with ${people.slice(0, 2).join(', ')}${people.length > 2 ? ` +${people.length - 2}` : ''}`
  return `Pasted conversation · ${new Date().toLocaleDateString()}`
}

export default function App() {
  const [repo, setRepo] = useState<ConversationRepository | null>(null)
  const [conversations, setConversations] = useState<ConversationRecord[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [view, setView] = useState<View>('import')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [visionFiles, setVisionFiles] = useState<File[] | null>(null)
  const [visionBusy, setVisionBusy] = useState(false)
  const [statuses, setStatuses] = useState<Record<string, AnalysisStatus>>({})
  const [answers, setAnswers] = useState<Record<string, AskAnswer[]>>({})
  const [ask, setAsk] = useState<{ busy: boolean; error: string | null; pending: string | null }>({ busy: false, error: null, pending: null })
  const [prefs, setPrefs] = useState<Preferences>(loadPrefs)
  const [systemReduced, setSystemReduced] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [urgency, setUrgency] = useState<UrgencyLevel>('low')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null)
  const [announce, setAnnounce] = useState('')
  const [booted, setBooted] = useState(false)
  const analyzeAbort = useRef<AbortController | null>(null)
  const askAbort = useRef<AbortController | null>(null)

  const reduced = prefs.motion === 'reduced' || systemReduced
  const active = conversations.find((c) => c.id === activeId) ?? null
  const masked = useMemo(() => (active ? maskMessages(active.messages, active.privacy) : null), [active?.messages, active?.privacy])

  const [language, setLang] = useState(getLanguage)
  useEffect(() => localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)), [prefs])
  useEffect(() => {
    document.documentElement.classList.toggle('dark', prefs.theme === 'dark')
    document.documentElement.style.colorScheme = prefs.theme
  }, [prefs.theme])
  useEffect(() => {
    if (reduced) return
    startSmoothScroll()
    return stopSmoothScroll
  }, [reduced])
  // Each view starts at the top; when the curtain runs, jump while it fully covers the screen.
  const firstView = useRef(true)
  useEffect(() => {
    if (firstView.current) return void (firstView.current = false)
    const t = setTimeout(() => scrollToTarget(0, { immediate: true }), reduced ? 0 : 480)
    return () => clearTimeout(t)
  }, [view, reduced])
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setSystemReduced(mq.matches)
    mq.addEventListener('change', on)
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as InstallPrompt)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => {
      mq.removeEventListener('change', on)
      window.removeEventListener('beforeinstallprompt', onPrompt)
    }
  }, [])

  const save = useCallback(
    async (record: ConversationRecord) => {
      setConversations((list) => [record, ...list.filter((c) => c.id !== record.id)].sort((a, b) => b.importedAt.localeCompare(a.importedAt)))
      await repo?.put(record).catch(() => setAnnounce('Could not save to this device. Your work stays available in this session.'))
    },
    [repo],
  )

  const toDraft = (result: ParseResult, sourceType: SourceType, fileName: string | null, extra?: Partial<Draft>) => {
    if (!result.messages.length) throw new ImportError('No messages were found in this input.')
    setDraft({ messages: result.messages, skipped: result.skipped, notes: result.notes, sourceType, title: defaultTitle(result, fileName), transcribed: false, warnings: [], ...extra })
    setImportError(null)
    setView('review')
    setAnnounce(`Parsed ${result.messages.length} messages. Review before sending.`)
  }

  const handleFiles = useCallback(async (files: File[], shared = false) => {
    setImportError(null)
    const kinds = files.map(fileKind)
    if (kinds.includes('unsupported')) return setImportError('Unsupported file. Use .txt, .json, a WhatsApp .zip, screenshots (.png/.jpg/.webp) or a PDF.')
    const visual = kinds.filter((k) => k === 'image' || k === 'pdf').length
    if (visual) {
      if (visual !== files.length) return setImportError('Import chat files and screenshots separately.')
      const problem = checkVisionSelection(files)
      if (problem) return setImportError(problem)
      setVisionFiles(files)
      return
    }
    if (files.length > 1) return setImportError('Import one chat file at a time.')
    try {
      const kind = kinds[0]
      const result = await parseFile(files[0])
      toDraft(result, shared ? 'share' : kind === 'zip' ? 'zip' : kind === 'json' ? 'json' : 'txt', files[0].name)
    } catch (e) {
      setImportError(e instanceof ImportError ? e.message : 'This file could not be read.')
    }
  }, [])

  // Boot: open storage, load history, then consume anything shared via the PWA share target.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const r = await createRepository()
      if (cancelled) return
      setRepo(r)
      const list = await r.list().catch(() => [])
      setConversations(list)
      setBooted(true)
      const params = new URLSearchParams(location.search)
      if (params.has('shared')) {
        params.delete('shared')
        history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`)
        const files = (await consumeShareInbox()).map(sharedItemToFile).filter((f): f is File => !!f)
        if (files.length) {
          const chat = files.filter((f) => fileKind(f) !== 'image' && fileKind(f) !== 'pdf')
          await handleFiles(chat.length ? [chat.find((f) => fileKind(f) === 'zip') ?? chat[0]] : files, true)
          return
        }
        setImportError('Nothing was received from the share. Try exporting the chat again.')
      }
      if (list.length) {
        setActiveId(list[0].id)
        setView('workspace')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [handleFiles])

  const runAnalysis = useCallback(
    async (record: ConversationRecord) => {
      analyzeAbort.current?.abort()
      const ctrl = new AbortController()
      analyzeAbort.current = ctrl
      const set = (s: AnalysisStatus) => setStatuses((m) => ({ ...m, [record.id]: s }))
      set({ state: 'running', phase: 0 })
      setAnnounce('Preparing messages')
      try {
        const { prepared: all } = maskMessages(record.messages, record.privacy)
        const covered = new Set(inRange(record).map((m) => m.id))
        const prepared = all.filter((m) => covered.has(m.id))
        const payload = { messages: toPayload(prepared) }
        set({ state: 'running', phase: 1 })
        setAnnounce('Gemini is reading the conversation')
        const raw = await callGemini<{ analysis: unknown; model: string }>('analyze', payload, ctrl.signal)
        set({ state: 'running', phase: 2 })
        setAnnounce('Linking evidence')
        const analysis = validateAnalysis(raw.analysis, prepared, raw.model)
        await save({ ...record, analysis })
        set({ state: 'idle' })
        setAnnounce('Catch-up ready')
      } catch (e) {
        if (e instanceof ApiError && e.code === 'aborted') return
        set({ state: 'error', message: errorMessage(e) })
        setAnnounce(`Analysis failed: ${errorMessage(e)}`)
      }
    },
    [save],
  )

  const confirmImport = async (input: { messages: ConversationRecord['messages']; privacy: ConversationRecord['privacy']; title: string }) => {
    if (!draft) return
    const record: ConversationRecord = {
      id: crypto.randomUUID(),
      schemaVersion: 1,
      title: input.title,
      importedAt: new Date().toISOString(),
      sourceType: draft.sourceType,
      messages: input.messages,
      privacy: input.privacy,
      transcribed: draft.transcribed,
      me: null,
      analysis: null,
    }
    // Re-importing a chat you've seen before: catch up only on what's new by default.
    const since = findSinceLast(record.messages, conversations)
    if (since) {
      record.sinceLastId = since.fromId
      record.readFrom = since.fromId
      record.me = conversations.find((c) => c.title === since.previousTitle)?.me ?? null
    }
    await save(record)
    setActiveId(record.id)
    setDraft(null)
    setView('workspace')
    void runAnalysis(record)
  }

  const runVision = async () => {
    if (!visionFiles) return
    setVisionBusy(true)
    setImportError(null)
    const ctrl = new AbortController()
    try {
      const files = await prepareVisionParts(visionFiles)
      const raw = await callGemini<unknown>('extract', { files: files.map(({ mimeType, data }) => ({ mimeType, data })) }, ctrl.signal)
      const { rows, warnings } = validateExtract(raw)
      const messages = reindex(rows.map((r, i) => ({ id: '', sourceIndex: i, ...r })))
      const isPdf = visionFiles.some((f) => fileKind(f) === 'pdf')
      toDraft({ messages, skipped: 0, format: 'vision', notes: [] }, isPdf ? 'pdf' : 'image', isPdf ? visionFiles[0].name : null, { transcribed: true, warnings })
      setVisionFiles(null)
    } catch (e) {
      setImportError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'These files could not be read.')
    } finally {
      setVisionBusy(false)
    }
  }

  const runAsk = async (question: string) => {
    if (!active?.analysis || ask.busy) return
    askAbort.current?.abort()
    const ctrl = new AbortController()
    askAbort.current = ctrl
    setAsk({ busy: true, error: null, pending: question })
    try {
      // Mask the question with the same placeholders as the conversation.
      const withQ = maskMessages([...active.messages, { id: '__q', sourceIndex: -1, sender: null, timestamp: null, text: question }], active.privacy)
      const qMasked = withQ.prepared[withQ.prepared.length - 1].text
      const prepared = withQ.prepared.slice(0, -1)
      const prev = answers[active.id]?.[0]?.question
      const raw = await callGemini<unknown>('ask', { messages: toPayload(prepared), question: qMasked, previousQuestion: prev ? maskMessages([{ id: 'p', sourceIndex: 0, sender: null, timestamp: null, text: prev }], active.privacy).prepared[0].text : null }, ctrl.signal)
      const answer = validateAnswer(raw, prepared, question, active.analysis)
      answer.answer = unmask(answer.answer, withQ.map)
      if (answer.urgencyReason) answer.urgencyReason = unmask(answer.urgencyReason, withQ.map)
      setAnswers((m) => ({ ...m, [active.id]: [answer, ...(m[active.id] ?? [])] }))
      setAsk({ busy: false, error: null, pending: null })
    } catch (e) {
      if (e instanceof ApiError && e.code === 'aborted') return setAsk({ busy: false, error: null, pending: null })
      setAsk({ busy: false, error: errorMessage(e), pending: question })
    }
  }

  const rename = (id: string, title: string) => {
    const r = conversations.find((c) => c.id === id)
    if (r) void save({ ...r, title })
  }
  const remove = async (id: string) => {
    if (id === activeId) analyzeAbort.current?.abort()
    const rest = conversations.filter((c) => c.id !== id)
    setConversations(rest)
    await repo?.remove(id).catch(() => undefined)
    if (id === activeId) {
      setActiveId(rest[0]?.id ?? null)
      if (!rest.length) setView('import')
    }
    setAnnounce('Conversation deleted from this device')
  }
  const clearAll = async () => {
    analyzeAbort.current?.abort()
    setConversations([])
    setAnswers({})
    await repo?.clear().catch(() => undefined)
    setActiveId(null)
    setView('import')
    setSettingsOpen(false)
    setAnnounce('All conversations deleted from this device')
  }

  const shellUrgency: UrgencyLevel = view === 'workspace' ? urgency : 'low'

  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <div className="app-shell relative min-h-screen" data-urgency={shellUrgency} data-ambient={prefs.ambient ? 'on' : 'off'} data-motion={reduced ? 'reduced' : 'auto'}>
        <div className="atmosphere" aria-hidden>
          <span className="wash-b" />
          <span className="wash-a" />
          <span className="grain" />
        </div>

        <header className="sticky top-0 z-30 border-b border-ink/5 bg-[color-mix(in_srgb,var(--u-base)_70%,transparent)] backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-3 px-4 sm:px-6">
            <button type="button" onClick={() => (setView('import'), setDraft(null), window.scrollTo({ top: 0 }))} aria-label="Unread home" title="Back to home" className="font-display text-2xl font-black uppercase tracking-tight">
              Unread<span className="text-[color:var(--u-accent)] transition-colors duration-700">.</span>
            </button>
            {view !== 'workspace' && conversations.length ? (
              <button type="button" onClick={() => (setView('workspace'), setActiveId((id) => id ?? conversations[0].id), setDraft(null))} className="ml-2 hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-card sm:inline-flex">
                <ArrowLeft className="size-4" aria-hidden /> Your conversations
              </button>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-ink/10 bg-card/60 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-soft md:inline-flex">
                <HardDrive className="size-3.5" aria-hidden /> {repo && !repo.persistent ? 'Session only' : 'Device-only history'}
              </span>
              <span className={`hidden items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider sm:inline-flex ${backendConfigured ? 'border-ink/10 bg-card/60 text-ink-soft' : 'border-[#a35a00]/30 bg-[#fdeac0] text-[#6f3d00]'}`}>
                <Sparkles className="size-3.5" aria-hidden /> {backendConfigured ? 'Gemini via Supabase' : 'Gemini not connected'}
              </span>
              <label className="relative inline-flex h-10 items-center gap-1.5 rounded-full border border-ink/10 bg-card/70 pl-3 pr-2 text-sm hover:border-ink">
                <Languages className="size-4" aria-hidden />
                <span className="sr-only">Output language</span>
                <select value={language} onChange={(e) => (setLanguage(e.target.value), setLang(e.target.value))} className="max-w-[7.5rem] cursor-pointer bg-transparent text-sm font-medium outline-none" title="Language for summaries and answers">
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l} className="bg-card text-ink">{l}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => setPrefs((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }))} className="grid size-10 place-items-center rounded-full border border-ink/10 bg-card/70 hover:border-ink" aria-label={prefs.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
                {prefs.theme === 'dark' ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
              </button>
              <button type="button" onClick={() => setSettingsOpen(true)} className="grid size-10 place-items-center rounded-full border border-ink/10 bg-card/70 hover:border-ink" aria-label="Settings">
                <Settings className="size-[18px]" aria-hidden />
              </button>
            </div>
          </div>
        </header>

        <p className="sr-only" role="status" aria-live="polite">
          {announce}
        </p>

        <Curtain token={view} reduced={reduced} label={view === 'review' ? 'Review' : view === 'workspace' ? 'Catch-up' : 'Import'} />

        <div className="relative pt-4">
          <Suspense fallback={null}>
          <AnimatePresence mode="wait">
            {view === 'import' && booted ? (
              <motion.div key="import" exit={{ opacity: 0, y: -40, filter: 'blur(10px)' }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
                <Landing reduced={reduced} dark={prefs.theme === 'dark'} />
              <ImportPanel
                intro={!conversations.length}
                onPaste={(text) => {
                  try {
                    toDraft(parseText(text), 'paste', null)
                  } catch (e) {
                    setImportError(e instanceof ImportError ? e.message : 'Could not read the pasted text.')
                  }
                }}
                onFiles={(f) => void handleFiles(f)}
                error={importError}
                visionFiles={visionFiles}
                visionBusy={visionBusy}
                onVisionConsent={() => void runVision()}
                onVisionCancel={() => setVisionFiles(null)}
                backendReady={backendConfigured}
              />
              </motion.div>
            ) : view === 'review' && draft ? (
              <ReviewPanel key="review" draft={draft} onBack={() => setView('import')} onConfirm={(i) => void confirmImport(i)} backendReady={backendConfigured} />
            ) : view === 'workspace' && active && masked ? (
              <Workspace
                key={active.id}
                record={active}
                masked={masked}
                status={statuses[active.id] ?? { state: 'idle' }}
                onRetry={() => void runAnalysis(active)}
                onRange={(readFrom) => {
                  const next = { ...active, readFrom, analysis: null }
                  void save(next).then(() => runAnalysis(next))
                }}
                onSetMe={(me) => void save({ ...active, me })}
                onUrgency={setUrgency}
                reduced={reduced}
                rail={(close) => (
                  <ConversationRail
                    conversations={conversations}
                    activeId={activeId}
                    persistent={repo?.persistent ?? true}
                    onSelect={(id) => (setActiveId(id), setAsk({ busy: false, error: null, pending: null }), close?.())}
                    onRename={rename}
                    onDelete={(id) => void remove(id)}
                    onNew={() => (setView('import'), setImportError(null), close?.())}
                  />
                )}
                askState={{
                  answers: answers[active.id] ?? [],
                  busy: ask.busy,
                  error: ask.error,
                  pendingQuestion: ask.pending,
                  onAsk: (q) => void runAsk(q),
                  onCancel: () => askAbort.current?.abort(),
                  onRetry: () => ask.pending && void runAsk(ask.pending),
                }}
              />
            ) : null}
          </AnimatePresence>
          </Suspense>
        </div>

        <Suspense fallback={null}>
          <SettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          prefs={prefs}
          onPrefs={setPrefs}
          onClearAll={() => void clearAll()}
          conversationCount={conversations.length}
          persistent={repo?.persistent ?? true}
          canInstall={!!installPrompt}
          onInstall={async () => {
            await installPrompt?.prompt()
            setInstallPrompt(null)
          }}
        />
        </Suspense>
      </div>
    </MotionConfig>
  )
}
