import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'

/** Full-bleed ink wipe that covers the screen while views swap underneath, then lifts away. */
export default function Curtain({ token, reduced, label }: { token: string; reduced: boolean; label: string }) {
  const [run, setRun] = useState(0)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) return void (first.current = false)
    if (!reduced) setRun((n) => n + 1)
  }, [token, reduced])

  if (!run) return null
  return (
    <motion.div
      key={run}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[70] grid place-items-center bg-ink text-paper"
      initial={{ clipPath: 'inset(100% 0% 0% 0%)' }}
      animate={{ clipPath: ['inset(100% 0% 0% 0%)', 'inset(0% 0% 0% 0%)', 'inset(0% 0% 0% 0%)', 'inset(0% 0% 100% 0%)'] }}
      transition={{ duration: 1.25, times: [0, 0.36, 0.6, 1], ease: [0.76, 0, 0.24, 1] }}
    >
      <motion.div className="overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: 1.25, times: [0.2, 0.36, 0.55, 0.7] }}>
        <motion.p className="font-display text-[clamp(3rem,10vw,9rem)] font-black uppercase leading-none" initial={{ y: '100%' }} animate={{ y: ['100%', '0%', '0%', '-100%'] }} transition={{ duration: 1.25, times: [0.18, 0.4, 0.55, 0.72], ease: [0.22, 1, 0.36, 1] }}>
          {label}
          <span className="text-signal">.</span>
        </motion.p>
      </motion.div>
    </motion.div>
  )
}
