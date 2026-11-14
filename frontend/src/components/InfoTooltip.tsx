import React, { useEffect, useId, useRef, useState } from 'react'
import { useViewportClampedTooltip } from '../hooks/useViewportClampedTooltip'

interface InfoTooltipProps {
  /** What the tooltip is about, e.g. "paid clubs". The trigger is named
   * "About <label>" so a screen reader does not hear "info" six times (#2644). */
  label: string
  /** The tooltip text to display on hover/focus/tap */
  text: string
}

/**
 * A small info icon button that reveals a tooltip on hover, focus or tap.
 * Used next to table headers and KPI labels to explain methodology.
 *
 * It is a toggle button: hover and focus open it, a click or tap pins it open
 * (touch has no hover), a second click closes it, and Escape closes it from
 * anywhere (WCAG 1.4.13). The panel is tied to the trigger with
 * `aria-describedby` while it is open.
 *
 * The 14px icon opts out of the global 44px button floor
 * (`.info-tooltip__trigger`), so it adds no height to the line it sits in; the
 * 44px hit area is an `::after` that overflows the line box.
 */
const InfoTooltip: React.FC<InfoTooltipProps> = ({ label, text }) => {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pinned, setPinned] = useState(false)
  // Set by Escape or a closing click; cleared by the next hover or focus.
  const [dismissed, setDismissed] = useState(false)
  const isVisible = (hovered || focused || pinned) && !dismissed
  const panelId = useId()
  const rootRef = useRef<HTMLSpanElement>(null)
  // Keeps the panel inside the viewport when the trigger sits near an edge
  // (#1405) — the rightmost table-header tooltip overflowed at every width.
  const { panelRef, style: clampStyle } =
    useViewportClampedTooltip<HTMLSpanElement>(isVisible)

  useEffect(() => {
    if (!isVisible) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setDismissed(true)
      setPinned(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isVisible])

  // Safari does not focus a button on click, so onBlur never fires and a
  // pinned tooltip would stay open: close it on any press outside it.
  useEffect(() => {
    if (!pinned) return
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      setPinned(false)
      setHovered(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [pinned])

  const handleClick = () => {
    if (isVisible && pinned) {
      setPinned(false)
      setDismissed(true)
    } else {
      setDismissed(false)
      setPinned(true)
    }
  }

  return (
    <span ref={rootRef} className="relative inline-flex items-center ml-1">
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={isVisible}
        aria-describedby={isVisible ? panelId : undefined}
        className="info-tooltip__trigger text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        onMouseEnter={() => {
          setDismissed(false)
          setHovered(true)
        }}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => {
          setDismissed(false)
          setFocused(true)
        }}
        onBlur={() => {
          setFocused(false)
          setPinned(false)
        }}
        onClick={handleClick}
      >
        <svg
          className="w-3.5 h-3.5"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {isVisible && (
        <span
          role="tooltip"
          id={panelId}
          ref={panelRef}
          style={clampStyle}
          className="absolute bottom-full tooltip-panel tooltip-panel--centered tooltip-panel--bordered mb-2 px-3 py-2 text-sm font-normal normal-case tracking-normal text-white bg-gray-900 rounded-lg shadow-lg whitespace-normal w-56 z-(--z-tooltip) leading-relaxed"
        >
          {text}
          <span className="absolute top-full tooltip-arrow--centered border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  )
}

export default InfoTooltip
