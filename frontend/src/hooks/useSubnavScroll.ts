import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useLocation } from 'react-router-dom'

/* #1829 (epic #1827) — keep a horizontal section-nav's ACTIVE link in view.

   The district / clubs-world subnavs are scroll-rows (`.district-subnav`,
   `overflow-x: auto`). At 375px the row is ~2x the viewport, and on 5 of 9
   district routes the active link sat off-screen at scrollLeft 0 — the reader
   could not see which section they were in.

   This hook:
   - centres the `aria-current="page"` link by setting the NAV's own
     scrollLeft (never `scrollIntoView`, which can also scroll the page
     vertically), on mount, on route change, after the web-font swap (the
     reflow moves every link — font-swap lesson) and on resize;
   - jumps instantly on first position (no visible motion on load), animates
     on in-place route changes unless `prefers-reduced-motion: reduce`;
   - reports which edges have more content, so CSS draws the fade cues via
     `data-fade-start` / `data-fade-end` (a mask — decorative, no DOM, so
     nothing to hide from assistive tech and nothing theme-coloured).

   Changing scrollLeft is not a layout shift, so it adds no CLS. */

export interface CenterGeometry {
  navLeft: number
  navWidth: number
  linkLeft: number
  linkWidth: number
  scrollLeft: number
  scrollWidth: number
}

/** The nav scrollLeft that centres the link, clamped to the scrollable range. */
export function centeredScrollLeft(g: CenterGeometry): number {
  const delta = g.linkLeft + g.linkWidth / 2 - (g.navLeft + g.navWidth / 2)
  const max = Math.max(0, g.scrollWidth - g.navWidth)
  return Math.round(Math.min(max, Math.max(0, g.scrollLeft + delta)))
}

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export interface SubnavEdges {
  start: boolean
  end: boolean
}

export function useSubnavScroll<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null)
  const { pathname } = useLocation()
  const positioned = useRef(false)
  const [edges, setEdges] = useState<SubnavEdges>({ start: false, end: false })

  const updateEdges = useCallback(() => {
    const nav = ref.current
    if (!nav) return
    const start = nav.scrollLeft > 1
    const end = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1
    setEdges(prev =>
      prev.start === start && prev.end === end ? prev : { start, end }
    )
  }, [])

  const centerActive = useCallback(
    (animate: boolean) => {
      const nav = ref.current
      if (!nav || typeof nav.scrollTo !== 'function') return
      const link = nav.querySelector<HTMLElement>('[aria-current="page"]')
      if (!link) return
      const navRect = nav.getBoundingClientRect()
      const linkRect = link.getBoundingClientRect()
      const left = centeredScrollLeft({
        navLeft: navRect.left,
        navWidth: nav.clientWidth,
        linkLeft: linkRect.left,
        linkWidth: linkRect.width,
        scrollLeft: nav.scrollLeft,
        scrollWidth: nav.scrollWidth,
      })
      nav.scrollTo({
        left,
        behavior: animate && !prefersReducedMotion() ? 'smooth' : 'auto',
      })
      updateEdges()
    },
    [updateEdges]
  )

  // Before paint: the first position is instant, so the row never visibly
  // jumps; later route changes (same mounted nav) may animate.
  useLayoutEffect(() => {
    centerActive(positioned.current)
    positioned.current = true
  }, [pathname, centerActive])

  useEffect(() => {
    const nav = ref.current
    if (!nav) return
    nav.addEventListener('scroll', updateEdges, { passive: true })
    const recenter = () => centerActive(false)
    const ro =
      typeof ResizeObserver === 'function' ? new ResizeObserver(recenter) : null
    ro?.observe(nav)
    let cancelled = false
    document.fonts?.ready?.then(() => {
      if (!cancelled) recenter()
    })
    return () => {
      cancelled = true
      nav.removeEventListener('scroll', updateEdges)
      ro?.disconnect()
    }
  }, [centerActive, updateEdges])

  return { ref, edges }
}

/** Spread onto the scroll container: CSS keys the fade cues off these. */
export const fadeEdgeAttrs = (edges: SubnavEdges) => ({
  'data-fade-start': edges.start ? '' : undefined,
  'data-fade-end': edges.end ? '' : undefined,
})
