import { useState } from 'react'
import { Check, MessageSquareText, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ConversationRecord } from '@/types'
import UrgencyBadge from './UrgencyBadge'
import { highestInAnalysis } from '@/lib/urgency'

type Props = {
  conversations: ConversationRecord[]
  activeId: string | null
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onNew: () => void
  persistent: boolean
}

export default function ConversationRail({ conversations, activeId, onSelect, onRename, onDelete, onNew, persistent }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [confirm, setConfirm] = useState<string | null>(null)

  return (
    <nav aria-label="Conversations" className="flex h-full flex-col">
      <button type="button" onClick={onNew} className="mx-3 mt-3 inline-flex items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition hover:bg-ink-soft active:scale-[0.97]">
        <Plus className="size-4" aria-hidden /> New import
      </button>
      <p className="mx-4 mt-5 font-mono text-[11px] uppercase tracking-wider text-muted">{persistent ? 'On this device' : 'This session only'}</p>
      <ul className="scrollbar-thin mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {conversations.map((c) => {
          const active = c.id === activeId
          return (
            <li key={c.id} className={`group rounded-2xl transition ${active ? 'bg-card shadow-sm' : 'hover:bg-card/60'}`}>
              {editing === c.id ? (
                <form
                  className="flex items-center gap-1 p-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (draft.trim()) onRename(c.id, draft.trim())
                    setEditing(null)
                  }}
                >
                  <label className="sr-only" htmlFor={`rename-${c.id}`}>
                    Rename conversation
                  </label>
                  <input id={`rename-${c.id}`} autoFocus value={draft} maxLength={80} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEditing(null)} className="min-w-0 flex-1 rounded-lg border border-ink/20 px-2 py-1.5 text-sm" />
                  <button type="submit" className="grid size-8 place-items-center rounded-lg hover:bg-paper" aria-label="Save name">
                    <Check className="size-4" aria-hidden />
                  </button>
                </form>
              ) : confirm === c.id ? (
                <div className="p-3 text-sm" role="group" aria-label={`Delete ${c.title}?`}>
                  <p className="font-medium">Delete “{c.title}” from this device?</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" autoFocus onClick={() => (onDelete(c.id), setConfirm(null))} className="rounded-full bg-[#b3131b] px-3 py-1.5 text-xs font-semibold text-white">
                      Delete
                    </button>
                    <button type="button" onClick={() => setConfirm(null)} className="rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold">
                      Keep
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start">
                  <button type="button" onClick={() => onSelect(c.id)} aria-current={active ? 'page' : undefined} className="min-w-0 flex-1 rounded-2xl px-3 py-2.5 text-left">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <MessageSquareText className="size-4 shrink-0 text-muted" aria-hidden />
                      <span className="truncate">{c.title}</span>
                    </span>
                    <span className="mt-1 flex items-center gap-2 pl-6 font-mono text-[11px] text-muted">
                      {c.messages.length} msgs
                      {c.analysis ? <UrgencyBadge level={highestInAnalysis(c.analysis)} size="sm" /> : <span>· not analyzed</span>}
                    </span>
                  </button>
                  <div className="flex shrink-0 gap-0.5 p-1.5 opacity-100 transition lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                    <button type="button" onClick={() => (setEditing(c.id), setDraft(c.title))} className="grid size-8 place-items-center rounded-lg hover:bg-paper" aria-label={`Rename ${c.title}`}>
                      <Pencil className="size-3.5" aria-hidden />
                    </button>
                    <button type="button" onClick={() => setConfirm(c.id)} className="grid size-8 place-items-center rounded-lg hover:bg-paper" aria-label={`Delete ${c.title}`}>
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
