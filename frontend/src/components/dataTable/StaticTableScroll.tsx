/**
 * StaticTableScroll (#2718, M5 of #2676, HUB-36).
 *
 * The labelled sideways scroller for hand-written `.dt` tables that do not use
 * the TanStack `DataTable` shell: a focusable `role="region"` with an accessible
 * name (WCAG 2.1.1; axe `scrollable-region-focusable`), plus the same edge
 * fades `DataTable` shows when more of the table lies off either side, so a
 * clipped column is never silent (UNIT-16).
 *
 * The region and name are always present rather than only while overflowing:
 * whether a table overflows depends on the viewport and the font, and an
 * unlabelled scroller is the defect. Give each table on a page its own label
 * (axe `landmark-unique`).
 *
 * Plain DOM and no TanStack, so it adds nothing to the entry chunk.
 */

import React, { useCallback, useLayoutEffect, useRef } from 'react'

interface StaticTableScrollProps {
  /** Short name of the table, e.g. "Clubs in Area 01". */
  label: string
  children: React.ReactNode
}

export const StaticTableScroll: React.FC<StaticTableScrollProps> = ({
  label,
  children,
}) => {
  const shellRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const syncEdges = useCallback(() => {
    const shell = shellRef.current
    const el = scrollRef.current
    if (!shell || !el) return
    shell.setAttribute('data-scrollable-start', String(el.scrollLeft > 1))
    shell.setAttribute(
      'data-scrollable-end',
      String(el.scrollWidth - el.clientWidth - el.scrollLeft > 1)
    )
  }, [])

  // Before paint, so the first frame already carries the right fade.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    syncEdges()
    el.addEventListener('scroll', syncEdges, { passive: true })
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(syncEdges)
      ro.observe(el)
    }
    return () => {
      el.removeEventListener('scroll', syncEdges)
      ro?.disconnect()
    }
  }, [syncEdges])

  return (
    <div
      ref={shellRef}
      className="dt-scroll-wrap"
      data-scrollable-start="false"
      data-scrollable-end="false"
    >
      <div
        ref={scrollRef}
        className="dt-scroll"
        data-overflow="true"
        role="region"
        tabIndex={0}
        aria-label={`${label}, scrolls sideways`}
      >
        {children}
      </div>
      <div
        className="dt-scroll__cue dt-scroll__cue--start"
        aria-hidden="true"
      />
      <div className="dt-scroll__cue dt-scroll__cue--end" aria-hidden="true" />
    </div>
  )
}

export default StaticTableScroll
