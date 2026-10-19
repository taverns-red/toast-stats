import { useEffect, useState } from 'react'

/**
 * How far outside the viewport counts as "near" (#2162): about a phone
 * screen's worth of scroll, so the tiles are usually painted by the time the
 * card scrolls in, while a card further down the page costs nothing.
 */
export const NEAR_VIEWPORT_MARGIN = '600px 0px'

/**
 * True once `el` has come within `NEAR_VIEWPORT_MARGIN` of the viewport
 * (#2162). Latched: it never turns false again, so a heavy chunk it gates is
 * fetched at most once. Without IntersectionObserver it stays false, and the
 * caller keeps its light fallback.
 */
export function useNearViewport(el: Element | null): boolean {
  const [near, setNear] = useState(false)

  useEffect(() => {
    if (!el || near || typeof IntersectionObserver !== 'function') return
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          io.disconnect()
          setNear(true)
        }
      },
      { rootMargin: NEAR_VIEWPORT_MARGIN }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [el, near])

  return near
}
