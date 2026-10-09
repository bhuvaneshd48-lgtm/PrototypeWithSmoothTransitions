import { useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import Dialog from './Dialog'
import UrgencyBadge from './UrgencyBadge'
import { LEVELS } from '@/lib/urgency'

export type Preferences = { ambient: boolean; motion: 'auto' | 'reduced'; theme: 'dark' | 'light' }

type Props = {
  open: boolean
  onClose: () => void
  prefs: Preferences
  onPrefs: (p: Preferences) => void
  onClearAll: () => void
  conversationCount: number
  persistent: boolean
  canInstall: boolean
  onInstall: () => void
}

export default function SettingsDialog({ open, onClose, prefs, onPrefs, onClearAll, conversationCount, persistent, canInstall, onInstall }: Props) {
  const [confirm, setConfirm] = useState(false)
  return (
    <Dialog open={open} onClose={() => (setConfirm(false), onClose())} title="Settings" widthClass="max-w-xl">
      <div className="space-y-6 p-6">
        <section aria-labelledby="set-display">
          <h3 id="set-display" className="font-semibold">
            Display
          </h3>
          <label className="mt-3 flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-line p-4">
            <span>
              <span className="block text-sm font-medium">Ambient urgency color</span>
              <span className="block text-sm text-muted">The background shifts with the focused item. Labels and icons stay when off.</span>
            </span>
            <input type="checkbox" className="mt-1 size-4 accent-ink" checked={prefs.ambient} onChange={(e) => onPrefs({ ...prefs, ambient: e.target.checked })} />
          </label>
          <label className="mt-2 flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-line p-4">
            <span>
              <span className="block text-sm font-medium">Reduce motion</span>
              <span className="block text-sm text-muted">Removes drift, staggers and movement. Your system setting is always respected.</span>
            </span>
            <input type="checkbox" className="mt-1 size-4 accent-ink" checked={prefs.motion === 'reduced'} onChange={(e) => onPrefs({ ...prefs, motion: e.target.checked ? 'reduced' : 'auto' })} />
          </label>
          <label className="mt-2 flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-line p-4">
            <span>
              <span className="block text-sm font-medium">Dark mode</span>
              <span className="block text-sm text-muted">Neon-lit night theme. Turn off for the light paper theme.</span>
            </span>
            <input type="checkbox" className="mt-1 size-4 accent-ink" checked={prefs.theme === 'dark'} onChange={(e) => onPrefs({ ...prefs, theme: e.target.checked ? 'dark' : 'light' })} />
          </label>
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Urgency scale">
            {LEVELS.map((l) => (
              <UrgencyBadge key={l} level={l} size="sm" />
            ))}
          </div>
        </section>

        {canInstall ? (
          <section aria-labelledby="set-install">
            <h3 id="set-install" className="font-semibold">
              Install
            </h3>
            <p className="mt-1 text-sm text-muted">Installing on Android adds Unread to the share sheet, so you can share a WhatsApp export straight here.</p>
            <button type="button" onClick={onInstall} className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper">
              <Download className="size-4" aria-hidden /> Install Unread
            </button>
          </section>
        ) : null}

        <section aria-labelledby="set-data">
          <h3 id="set-data" className="font-semibold">
            Your data
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink-soft">
            <li>{persistent ? 'Conversations and analyses are stored in this browser (IndexedDB) only.' : 'This browser blocks local storage, so history lasts for this session only.'}</li>
            <li>Gemini receives only the prepared, masked messages you confirm. The mask key stays here.</li>
            <li>Google Gemini powers summaries, urgency, extraction, screenshot reading and Q&A.</li>
          </ul>
          {confirm ? (
            <div className="mt-3 rounded-2xl border border-[#b3131b]/30 bg-[#fbd0c9]/50 p-4" role="group" aria-label="Confirm clear all">
              <p className="text-sm font-medium">Delete all {conversationCount} conversations from this device? This can’t be undone.</p>
              <div className="mt-2 flex gap-2">
                <button type="button" autoFocus onClick={() => (onClearAll(), setConfirm(false))} className="rounded-full bg-[#b3131b] px-4 py-2 text-sm font-semibold text-white">
                  Delete all
                </button>
                <button type="button" onClick={() => setConfirm(false)} className="rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={!conversationCount} onClick={() => setConfirm(true)} className="mt-3 inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold hover:border-[#b3131b] hover:text-[#b3131b] disabled:opacity-40">
              <Trash2 className="size-4" aria-hidden /> Clear all history
            </button>
          )}
        </section>
      </div>
    </Dialog>
  )
}
