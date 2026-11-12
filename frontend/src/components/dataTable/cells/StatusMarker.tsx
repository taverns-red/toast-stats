/**
 * StatusMarker (#2676, Clubs table spec §3.1).
 *
 * A small inline-SVG shape that reinforces a club's health status without
 * relying on colour: a filled circle with a knocked-out x (intervention), an
 * outlined warning triangle (vulnerable) and a plain tick (thriving). Shapes
 * differ, so the marker still reads in greyscale and for colour-blind readers.
 *
 * SVG rather than the Unicode glyphs (check, warning, cross): those can render
 * as colour emoji on iOS and Windows, which would bring colour back. Colours
 * come from `.dt-marker--*` in `data-table.css` (legacy tokens only), so both
 * themes are covered by CSS. The marker is decorative (`aria-hidden`); the text
 * label beside it carries the meaning.
 */

import React from 'react'
import type { ClubHealthStatus } from '../../../hooks/useDistrictAnalytics'

interface StatusMarkerProps {
  status: ClubHealthStatus
  className?: string
}

export const StatusMarker: React.FC<StatusMarkerProps> = ({
  status,
  className,
}) => {
  const cls = `dt-marker dt-marker--${status}${className ? ` ${className}` : ''}`
  return (
    <svg
      className={cls}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      focusable="false"
      data-marker={status}
    >
      {status === 'intervention-required' && (
        <>
          <circle cx="7" cy="7" r="7" fill="currentColor" />
          <path
            className="dt-marker__knockout"
            d="M4.5 4.5 L9.5 9.5 M9.5 4.5 L4.5 9.5"
            fill="none"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </>
      )}
      {status === 'vulnerable' && (
        <>
          <path
            d="M7 1.5 L13 12.5 L1 12.5 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M7 5.5 L7 8.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="7" cy="10.5" r="0.9" fill="currentColor" />
        </>
      )}
      {status === 'thriving' && (
        <path
          d="M2.5 7.5 L5.8 10.8 L11.5 3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

export default StatusMarker
