import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react'

/* Edge-aware overflow cue for a horizontal scroller (#1846).

   Below 768 the landing's chip rows are single scrolling lines (#1359 gap
   (c)). A fixed right-hand fade cannot say "this is the end" or "there is
   more to the left", so this hook marks which edges still hide content —
   `data-more-before` / `data-more-after` on the scroller — and the CSS fades
   exactly those.

   Spread the result onto the scroller: `<div {...useScrollEdges()} />`.
   The attributes are written straight to the element rather than through
   React state: a scroll then costs no re-render, and React never renders
   these attributes, so it never clobbers them. Attributes only — no element
   is added — so the cue itself cannot shift layout. Re-measured on scroll,
   on window resize, on the element's own resize (ResizeObserver, where
   available) and whenever `contentKey` changes (e.g. the regions landing). */

export interface ScrollEdgeProps<T extends HTMLElement> {
  ref: React.RefCallback<T>
}

/** Sub-pixel scroll positions (zoom, DPR) must not leave a stray fade. */
const SLOP = 1

export function useScrollEdges<T extends HTMLElement>(
  contentKey?: unknown
): ScrollEdgeProps<T> {
  const [el, setEl] = useState<T | null>(null)

  const update = useCallback(() => {
    if (!el) return
    el.toggleAttribute('data-more-before', el.scrollLeft > SLOP)
    el.toggleAttribute(
      'data-more-after',
      el.scrollLeft + el.clientWidth < el.scrollWidth - SLOP
    )
  }, [el])

  // Layout effect: the first paint already carries the right fade.
  useLayoutEffect(update, [update, contentKey])

  useEffect(() => {
    if (!el) return
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    const ro =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      ro?.disconnect()
    }
  }, [el, update])

  return { ref: setEl }
}
