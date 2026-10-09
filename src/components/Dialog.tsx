import { useEffect, useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { lockScroll } from '@/lib/scroll'

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  variant?: 'center' | 'right' | 'bottom'
  /** Element to focus first; defaults to the first focusable element. */
  initialFocus?: React.RefObject<HTMLElement | null>
  widthClass?: string
}

/** Accessible modal: focus trap, Escape to close, and focus restoration to the trigger. */
export default function Dialog({ open, onClose, title, children, variant = 'center', initialFocus, widthClass }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const restore = useRef<HTMLElement | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    restore.current = document.activeElement as HTMLElement | null
    const t = window.setTimeout(() => {
      const target = initialFocus?.current ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE)
      target?.focus()
    }, 30)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      }
      if (e.key === 'Tab' && panel.current) {
        const nodes = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null)
        if (!nodes.length) return
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    lockScroll(true)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      lockScroll(false)
      restore.current?.focus?.()
    }
  }, [open, initialFocus])

  const placement =
    variant === 'right'
      ? 'right-0 top-0 h-full w-full sm:w-[min(520px,100vw)] rounded-none sm:rounded-l-[28px]'
      : variant === 'bottom'
        ? 'bottom-0 left-0 right-0 max-h-[88vh] rounded-t-[28px]'
        : `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-2rem)] ${widthClass ?? 'max-w-lg'} max-h-[88vh] rounded-[28px]`
  const offscreen = variant === 'right' ? { x: 48, opacity: 0 } : variant === 'bottom' ? { y: 64, opacity: 0 } : { scale: 0.96, opacity: 0 }

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <div className={`absolute ${placement} pointer-events-none`}>
            <motion.div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-label={title}
              className={`pointer-events-auto flex h-full max-h-[inherit] flex-col overflow-hidden bg-card shadow-2xl ${variant === 'center' ? 'rounded-[28px]' : variant === 'bottom' ? 'rounded-t-[28px]' : 'sm:rounded-l-[28px]'}`}
              initial={offscreen}
              animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
              exit={offscreen}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            >
              <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
                <h2 className="font-display text-2xl font-extrabold uppercase">{title}</h2>
                <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full hover:bg-paper" aria-label="Close">
                  <X className="size-5" aria-hidden />
                </button>
              </div>
              <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
