import { useEffect, useRef, useState } from 'react'

/** Fallback for a hidden tab, where requestAnimationFrame does not fire. */
export const AFTER_PAINT_FALLBACK_MS = 250

/** Longest the gate waits for an LCP entry before opening anyway (#2777). */
export const LCP_WAIT_CAP_MS = 400

const INPUT_EVENTS = ['pointerdown', 'keydown', 'scroll'] as const

/**
 * Browsers stop emitting LCP entries after the first user input, and never
 * emit them for a client-side route change, so only the document's first
 * route mount, before any input, can wait for one (#2777).
 */
let userInteracted = false
let firstMountClaimed = false

function recordInput(): void {
  userInteracted = true
}

if (typeof window !== 'undefined') {
  for (const type of INPUT_EVENTS) {
    window.addEventListener(type, recordInput, {
      capture: true,
      once: true,
      passive: true,
    })
  }
}

/**
 * Input before this lazy chunk loaded (a click from another route) predates
 * the listeners above; the browser buffers it as a `first-input` entry.
 */
function inputRecordedByBrowser(): boolean {
  try {
    return performance.getEntriesByType('first-input').length > 0
  } catch {
    return false
  }
}

/** Test seam: forget the first-mount claim and any recorded user input. */
export function resetAfterPaintStateForTests(): void {
  userInteracted = false
  firstMountClaimed = false
}

/** A visible tab in a browser that reports `largest-contentful-paint`. */
function canObserveLcp(): boolean {
  return (
    typeof PerformanceObserver !== 'undefined' &&
    PerformanceObserver.supportedEntryTypes?.includes(
      'largest-contentful-paint'
    ) === true &&
    document.visibilityState !== 'hidden'
  )
}

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
 * #2777 — "one frame later" is not "after the LCP timestamp". LCP is stamped
 * when the frame is presented, which can be tens of milliseconds after the
 * rAF + macrotask here has run, so the reads this gate releases could start
 * and finish ahead of it and be charged to LCP: the club route's simulated
 * LCP flipped between ~3.6 s and ~4.2 s run to run. Where the browser reports
 * LCP, the gate therefore waits for an LCP entry
 * (capped at `LCP_WAIT_CAP_MS`, for a paint that is not a new candidate).
 * Only the document's first route mount, before any user input, waits:
 * browsers stop emitting LCP after input and for soft navigations. Those,
 * browsers without LCP, and hidden tabs keep the frame-based path.
 *
 * Once true it stays true for the component's lifetime, so a later
 * `ready === false` (a refetch, a date change) never closes the gate again.
 */
export function useAfterPaint(ready: boolean): boolean {
  const [painted, setPainted] = useState(false)
  // null until the first effect decides whether this mount may wait for LCP.
  const mayWaitForLcp = useRef<boolean | null>(null)

  useEffect(() => {
    // Claim on mount, ready or not: the first route mount owns the LCP path.
    if (mayWaitForLcp.current === null) {
      mayWaitForLcp.current =
        !firstMountClaimed && !userInteracted && !inputRecordedByBrowser()
      firstMountClaimed = true
    }

    if (!ready || painted) return
    const open = () => setPainted(true)

    if (mayWaitForLcp.current && !userInteracted && canObserveLcp()) {
      const readyAt = performance.now()
      let timer = 0
      // Not `buffered`: replaying an early candidate recorded before the hero
      // rendered would open the gate ahead of the real LCP. On a slow device
      // whose entry lands before readiness, the cap opens the gate.
      const observer = new PerformanceObserver(list => {
        if (list.getEntries().some(entry => entry.startTime >= readyAt)) {
          observer.disconnect()
          // Leave the observer callback; the reads start in the next task.
          timer = window.setTimeout(open, 0)
        }
      })
      observer.observe({ type: 'largest-contentful-paint' })
      const cap = window.setTimeout(open, LCP_WAIT_CAP_MS)
      return () => {
        observer.disconnect()
        window.clearTimeout(timer)
        window.clearTimeout(cap)
      }
    }

    let timer = 0
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
