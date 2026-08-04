import React, { useState } from 'react'
import { useViewportClampedTooltip } from '../hooks/useViewportClampedTooltip'

interface InfoTooltipProps {
  /** The tooltip text to display on hover/focus */
  text: string
}

/**
 * A small info icon button that reveals a tooltip on hover or focus.
 * Used next to table headers to explain methodology.
 */
const InfoTooltip: React.FC<InfoTooltipProps> = ({ text }) => {
  const [isVisible, setIsVisible] = useState(false)
  // Keeps the panel inside the viewport when the trigger sits near an edge
  // (#1405) — the rightmost table-header tooltip overflowed at every width.
  const { panelRef, style: clampStyle } =
    useViewportClampedTooltip<HTMLSpanElement>(isVisible)

  return (
    <span className="relative inline-flex items-center ml-1">
      <button
        type="button"
        aria-label="info"
        className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-hidden"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
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
          ref={panelRef}
          style={clampStyle}
          className="absolute bottom-full tooltip-panel tooltip-panel--centered mb-2 px-3 py-2 text-xs font-normal normal-case tracking-normal text-white bg-gray-900 rounded-lg shadow-lg whitespace-normal w-56 z-50 leading-relaxed"
        >
          {text}
          <span className="absolute top-full tooltip-arrow--centered border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  )
}

export default InfoTooltip
