import { useCallback, useLayoutEffect, useRef, useState } from 'react'

/** Is there more content past each horizontal edge of the scroller? */
function edgesOf(el: HTMLElement): { start: boolean; end: boolean } {
  return {
    start: el.scrollLeft > 1,
    end: el.scrollWidth - el.clientWidth - el.scrollLeft > 1,
  }
}

/**
 * Overflow mode for a table shell: true only when the columns are wider than
 * the wrapper. The table and its loading skeleton share it, so the skeleton
 * scrolls (and shows the hint) exactly where the table will.
 */
export function useTableOverflow(totalSize: number, disabled = false) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState(false)

  const syncEdges = useCallback(() => {
    const wrap = wrapRef.current
    const shell = shellRef.current
    if (!wrap || !shell) return
    const { start, end } = edgesOf(wrap)
    shell.setAttribute('data-scrollable-start', String(start))
    shell.setAttribute('data-scrollable-end', String(end))
  }, [])

  // Measured before paint, so the first frame is already in the right mode and
  // nothing shifts (CLS). A wrapper with no layout (width 0, as in jsdom) is
  // never "overflowing".
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || disabled) return
    const measure = () => {
      const width = wrap.clientWidth
      setOverflow(width > 0 && totalSize > width)
      syncEdges()
    }
    measure()
    wrap.addEventListener('scroll', syncEdges, { passive: true })
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(wrap)
    }
    return () => {
      wrap.removeEventListener('scroll', syncEdges)
      ro?.disconnect()
    }
  }, [totalSize, syncEdges, disabled])

  return { wrapRef, shellRef, overflow, syncEdges }
}
