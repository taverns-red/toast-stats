import { useEffect, useLayoutEffect } from 'react'
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
 *  - records the live scroll offset per `location.key`;
 *  - on PUSH/REPLACE scrolls to the top (honoring a resolvable hash);
 *  - on POP re-applies the saved offset across animation frames until the
 *    document has grown tall enough to honor it (or a frame budget elapses).
 *
 * It depends only on `useLocation`/`useNavigationType`, so it works under any
 * router (no data-router requirement).
 */

// Module-scoped so positions survive the per-route component remounts.
const scrollPositions = new Map<string, number>()

/** Test-only: reset the cross-render position store between cases. */
export const __scrollPositionsForTest = scrollPositions

// ~50 frames ≈ 0.8s at 60fps — long enough for async, data-driven height growth
// to settle, short enough to never feel like a fight with the user.
const MAX_RESTORE_FRAMES = 50

function restoreScroll(target: number): void {
  let frame = 0
  const tick = (): void => {
    window.scrollTo(0, target)
    frame += 1
    if (Math.abs(window.scrollY - target) <= 2 || frame >= MAX_RESTORE_FRAMES) {
      return
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

export function useScrollRestoration(): void {
  const location = useLocation()
  const navigationType = useNavigationType()

  // Continuously record the active location's scroll offset so a later POP back
  // to it restores exactly where the user left off.
  useEffect(() => {
    const key = location.key
    const record = (): void => {
      scrollPositions.set(key, window.scrollY)
    }
    record()
    window.addEventListener('scroll', record, { passive: true })
    return () => window.removeEventListener('scroll', record)
  }, [location.key])

  // The browser's native restoration races our SPA restoration; own it.
  useEffect(() => {
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = previous
    }
  }, [])

  useLayoutEffect(() => {
    // Hash anchors: scroll the target element into view (matches the browser /
    // RR default). Don't fight JumpToChip / MethodologyPage TOC jumps.
    if (location.hash) {
      try {
        const el = document.getElementById(
          decodeURIComponent(location.hash.slice(1))
        )
        if (el) {
          el.scrollIntoView()
          return
        }
      } catch {
        // Undecodable hash — fall through to the default behavior below.
      }
    }

    if (navigationType === 'POP') {
      const saved = scrollPositions.get(location.key)
      if (saved != null && saved > 0) {
        restoreScroll(saved)
        return
      }
    }

    // PUSH / REPLACE (or POP with nothing to restore): start at the top.
    window.scrollTo(0, 0)
    // location.key + navigationType together identify a single navigation.
  }, [location.key, location.hash, navigationType])
}
