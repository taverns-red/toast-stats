import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Scroll restoration for the data router (#1103).
 *
 * `createBrowserRouter` no longer auto-resets scroll on navigation, and RR's
 * built-in `<ScrollRestoration/>` restores the saved offset once, synchronously,
 * at the POP commit. On this app the landing leaderboard renders *short* on its
 * first commit — the region filter inflates to the full row set via a post-mount
 * effect that is deliberately load-bearing for CLS (Lesson 145) — so a single
 * `scrollTo` clamps to the short height and Back lands at the top.
 *
 * This hook owns restoration instead:
 *  - records the live scroll offset per location via a scroll listener keyed by
 *    an `activeKey` ref. Recording continuously (not at navigation time) is what
 *    makes it work on WebKit: by the time a layout-effect cleanup runs, Safari
 *    has already clamped `window.scrollY` to 0 on the new (short) DOM, so any
 *    navigation-time read saves 0. The ref is advanced *after* each navigation's
 *    scroll decision, so the browser's reset events record under the new key and
 *    never clobber the page we're leaving.
 *  - PUSH → scroll to top; REPLACE → preserve scroll (same-page URL updates like
 *    the region-filter `?regions=…` normalization must not jump to top);
 *  - POP → re-apply the saved offset across animation frames until it sticks for
 *    a few consecutive frames (async height has settled AND no late native reset
 *    is pulling it back) or a frame budget elapses;
 *  - a resolvable hash defers to `scrollIntoView` (don't fight the TOC jumps).
 *
 * Depends only on `useLocation`/`useNavigationType`, so it works under any router.
 */

// Module-scoped so positions survive across navigations (AppShell stays mounted).
const scrollPositions = new Map<string, number>()

/** Test-only: reset the cross-render position store between cases. */
export const __scrollPositionsForTest = scrollPositions

// ~1.2s of frames — long enough for async, data-driven height growth AND a late
// WebKit native scroll reset to settle, short enough to never feel like a fight.
const MAX_RESTORE_FRAMES = 72

// `behavior: 'instant'` is mandatory: the app sets `html { scroll-behavior:
// smooth }`, so the (x, y) form of scrollTo *animates* — restoration would
// crawl toward the target and the rAF budget would expire mid-animation,
// landing the page partway up. 'instant' overrides the CSS and jumps.
function jumpTo(top: number): void {
  window.scrollTo({ top, left: 0, behavior: 'instant' })
}

// Re-apply the target every frame until it holds for a few consecutive frames
// (data-driven height settled AND no late native reset pulling it back), or the
// budget elapses.
function restoreScroll(target: number): void {
  let frame = 0
  let stableFrames = 0
  const tick = (): void => {
    jumpTo(target)
    frame += 1
    stableFrames = Math.abs(window.scrollY - target) <= 2 ? stableFrames + 1 : 0
    if (stableFrames >= 3 || frame >= MAX_RESTORE_FRAMES) {
      return
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

export function useScrollRestoration(): void {
  const location = useLocation()
  const navigationType = useNavigationType()
  // The location key that scroll events should currently be recorded against.
  // Advanced at the END of each navigation's layout effect (see below).
  const activeKey = useRef(location.key)

  useEffect(() => {
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    const record = (): void => {
      scrollPositions.set(activeKey.current, window.scrollY)
    }
    window.addEventListener('scroll', record, { passive: true })
    return () => {
      window.removeEventListener('scroll', record)
      window.history.scrollRestoration = previous
    }
  }, [])

  useLayoutEffect(() => {
    const key = location.key

    // Hash anchors: scroll the target element into view (matches the browser /
    // RR default). Don't fight JumpToChip / MethodologyPage TOC jumps.
    if (location.hash) {
      try {
        const el = document.getElementById(
          decodeURIComponent(location.hash.slice(1))
        )
        if (el) {
          el.scrollIntoView({ behavior: 'instant', block: 'start' })
          activeKey.current = key
          return
        }
      } catch {
        // Undecodable hash — fall through to the default behavior below.
      }
    }

    if (navigationType === 'POP') {
      const saved = scrollPositions.get(key)
      if (saved != null && saved > 0) {
        restoreScroll(saved)
      }
    } else if (navigationType === 'PUSH') {
      // New page: start at the top. (REPLACE is a same-page URL update — leave
      // the scroll where it is.)
      jumpTo(0)
    }

    // Advance the recording key only now, so the browser's post-navigation
    // scroll-reset events record under the NEW key and never overwrite the
    // offset saved for the page we just left.
    activeKey.current = key
  }, [location.key, location.hash, navigationType])
}
