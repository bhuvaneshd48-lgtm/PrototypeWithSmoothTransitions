import Lenis from 'lenis'

// One shared inertial scroller for the whole app. Falls back to native scroll when
// motion is reduced (no instance is created) so every helper stays safe to call.
let lenis: Lenis | null = null

export function startSmoothScroll() {
  if (lenis || typeof window === 'undefined') return
  lenis = new Lenis({ autoRaf: true, lerp: 0.085, wheelMultiplier: 0.9, allowNestedScroll: true })
}

export function stopSmoothScroll() {
  lenis?.destroy()
  lenis = null
}

/** Pause/resume inertial scrolling, e.g. while a modal locks the page. */
export function lockScroll(locked: boolean) {
  if (locked) lenis?.stop()
  else lenis?.start()
}

export function scrollToTarget(target: number | string | HTMLElement, opts: { immediate?: boolean; offset?: number } = {}) {
  if (lenis) {
    lenis.scrollTo(target, { immediate: opts.immediate, offset: opts.offset ?? 0, duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) })
    return
  }
  const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : typeof target === 'number' ? null : target
  const top = typeof target === 'number' ? target : el ? el.getBoundingClientRect().top + window.scrollY + (opts.offset ?? 0) : 0
  window.scrollTo({ top, behavior: opts.immediate ? 'auto' : 'smooth' })
}
