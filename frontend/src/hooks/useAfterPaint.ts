import { useEffect, useState } from 'react'

/** Fallback for a hidden tab, where requestAnimationFrame does not fire. */
export const AFTER_PAINT_FALLBACK_MS = 250

/**
 * True once `ready` has been true for one painted frame (#1901).
 *
 * A route uses it to hold back a heavy, below-the-fold fetch until its first
 * screen has painted. While that fetch is in flight it competes for the
 * phone's bandwidth with the small reads the first screen needs. Lighthouse's
 * simulated LCP also charges every request that finished before the LCP
 * paint. The district analytics file (~150 KB on the wire, 3.65 MB decoded)
 * was ~0.75 s of the mobile LCP on both `/district/:id` and the club page.
 *
 * Once true it stays true for the component's lifetime, so a later
 * `ready === false` (a refetch, a date change) never closes the gate again.
 */
export function useAfterPaint(ready: boolean): boolean {
  const [painted, setPainted] = useState(false)

  useEffect(() => {
    if (!ready || painted) return
    let timer = 0
    const open = () => setPainted(true)
    // rAF runs just before the next frame is painted; the macrotask it
    // schedules runs after that paint.
    const raf = requestAnimationFrame(() => {
      timer = window.setTimeout(open, 0)
    })
    const fallback = window.setTimeout(open, AFTER_PAINT_FALLBACK_MS)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
      window.clearTimeout(fallback)
    }
  }, [ready, painted])

  return painted
}
