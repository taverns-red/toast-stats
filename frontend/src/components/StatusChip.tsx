/* StatusChip (#871, epic #873 Sprint 1 — CC-4).
 *
 * The Division / Area club mini-tables rendered the raw `currentStatus` enum
 * as plain `whitespace-nowrap` text, which clips to "vulne…" / "interv…" at
 * 375px (CC-4). This chip is the mobile (<768px) treatment: a colored pill
 * carrying the short label AND a glyph, so meaning never rests on colour alone
 * (WCAG 1.4.1). Label and colour modifier are the shared single source of truth
 * in `utils/clubHealthStatus.ts` (lesson 052) — identical to the desktop
 * ClubsTable pill. The chip adds an icon glyph on top, per the CC-4 a11y
 * criterion (colour + text + icon); the desktop pill stays icon-free
 * ("Desktop unchanged").
 *
 * Per lesson 077 it accepts a `className` override rather than a variant
 * taxonomy, so each call site can add its own layout class. */

import React from 'react'
import type { ClubHealthStatus } from '../hooks/useDistrictAnalytics'
import {
  getClubHealthStatusIcon,
  getClubHealthStatusLabel,
  getClubHealthStatusPillModifier,
} from '../utils/clubHealthStatus'

interface StatusChipProps {
  status: ClubHealthStatus
  className?: string
  /** Label override (e.g. the one-word short label in a compact row, #1833).
   *  Defaults to the shared full label. */
  label?: string
}

export const StatusChip: React.FC<StatusChipProps> = ({
  status,
  className,
  label,
}) => {
  const modifier = getClubHealthStatusPillModifier(status)
  return (
    <span
      className={`clubs-status-pill ${modifier}${
        className ? ` ${className}` : ''
      }`}
    >
      <span aria-hidden="true">{getClubHealthStatusIcon(status)}</span>{' '}
      {/* A class hook so a cramped row can show the glyph alone (#2340). */}
      <span className="status-chip__label">
        {label ?? getClubHealthStatusLabel(status)}
      </span>
    </span>
  )
}

export default StatusChip
