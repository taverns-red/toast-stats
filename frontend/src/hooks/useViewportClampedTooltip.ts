import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import {
  computeArrowShift,
  computeTooltipShift,
} from '../utils/tooltipViewportShift'

/* Keeps a centred tooltip panel inside the viewport (#1405).
 *
 * Both shared tooltip components centre a fixed-width panel on their trigger,
 * so a trigger in a card's leftmost (or rightmost) column put half the panel
 * off-screen. The measurement has to happen at runtime — the overflow depends
 * on where the trigger landed, which no static rule knows — but the RESULT is
 * expressed purely as two CSS custom properties, so the positioning itself
 * stays in `styles/components/tooltip.css` (R10) rather than in JS style
 * objects scattered per card.
 *
 * Runs in `useLayoutEffect`, so the shift is applied in the same frame the
 * panel appears: no visible jump, and nothing to shift since the panel is
 * absolutely positioned and out of flow (no CLS).
 */

/** The custom properties `styles/components/tooltip.css` reads. */
export interface TooltipClampStyle extends CSSProperties {
  '--tooltip-shift': string
  '--tooltip-arrow-shift': string
}

export interface ViewportClampedTooltip<T extends HTMLElement> {
  /** Attach to the tooltip panel. */
  panelRef: React.RefObject<T | null>
  /** Spread onto the same element as `style`. */
  style: TooltipClampStyle
}

export function useViewportClampedTooltip<T extends HTMLElement>(
  isOpen: boolean
): ViewportClampedTooltip<T> {
  const panelRef = useRef<T | null>(null)
  const [shift, setShift] = useState(0)
  const [arrowShift, setArrowShift] = useState(0)
  // The measured box already includes the shift we applied last pass, so the
  // applied value has to be readable synchronously to recover the unshifted
  // extent — otherwise a re-measure (resize) would compound.
  const appliedShift = useRef(0)

  useLayoutEffect(() => {
    if (!isOpen) {
      appliedShift.current = 0
      setShift(0)
      setArrowShift(0)
      return
    }

    const measure = () => {
      const panel = panelRef.current
      if (!panel || typeof window === 'undefined') return

      const rect = panel.getBoundingClientRect()
      // A layout-less environment (jsdom) reports a zero box. There is nothing
      // to clamp, and treating 0 as a real measurement would invent a shift.
      if (rect.width === 0) return

      // `clientWidth` is the visible content width — unlike `innerWidth` it
      // excludes a classic scrollbar, which the panel must not slide under.
      const viewportWidth =
        document.documentElement.clientWidth || window.innerWidth

      const next = computeTooltipShift(
        {
          left: rect.left - appliedShift.current,
          right: rect.right - appliedShift.current,
        },
        viewportWidth
      )
      if (next === appliedShift.current) return

      appliedShift.current = next
      setShift(next)
      setArrowShift(computeArrowShift(next, rect.width))
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [isOpen])

  return {
    panelRef,
    style: {
      '--tooltip-shift': `${shift}px`,
      '--tooltip-arrow-shift': `${arrowShift}px`,
    },
  }
}

export default useViewportClampedTooltip
