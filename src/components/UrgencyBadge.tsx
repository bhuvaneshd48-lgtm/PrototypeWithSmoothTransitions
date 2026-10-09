import { CircleAlert, Leaf, OctagonAlert, TriangleAlert } from 'lucide-react'
import type { UrgencyLevel } from '@/types'
import { LEVEL_LABEL } from '@/lib/urgency'

const ICON = { low: Leaf, medium: CircleAlert, high: TriangleAlert, critical: OctagonAlert }

export default function UrgencyBadge({ level, reason, size = 'md' }: { level: UrgencyLevel; reason?: string | null; size?: 'sm' | 'md' }) {
  const Icon = ICON[level]
  return (
    <span
      className={`urgency-badge lvl-${level} inline-flex shrink-0 items-center gap-1.5 rounded-full font-mono font-medium uppercase tracking-wide ${size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'}`}
      style={{ background: 'var(--l-tint)', color: 'var(--l-text)' }}
      title={reason ?? undefined}
    >
      <Icon aria-hidden className={size === 'sm' ? 'size-3' : 'size-3.5'} strokeWidth={2.4} style={{ color: 'var(--l-accent)' }} />
      <span>
        <span className="sr-only">Urgency: </span>
        {LEVEL_LABEL[level]}
      </span>
      {reason ? <span className="sr-only">. {reason}</span> : null}
    </span>
  )
}
