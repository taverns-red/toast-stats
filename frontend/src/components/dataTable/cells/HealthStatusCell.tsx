/**
 * HealthStatusCell (#2676, Clubs table spec §3.1).
 *
 * A shape marker followed by a text label, both in normal ink at the table's
 * 14px size. No background, border or pill, and no row tint: colour appears
 * only in the marker and is never the only signal (WCAG 1.4.1).
 *
 * The visible label is the short one the phone rows already use
 * ("Intervention"); the rest of the full label ("required") is screen-reader
 * only, so assistive tech hears the whole phrase. Labels come from
 * `utils/clubHealthStatus.ts`, the single source of truth (lesson 052).
 */

import React from 'react'
import type { ClubHealthStatus } from '../../../hooks/useDistrictAnalytics'
import {
  getClubHealthStatusLabel,
  getClubHealthStatusShortLabel,
} from '../../../utils/clubHealthStatus'
import { StatusMarker } from './StatusMarker'

interface HealthStatusCellProps {
  status: ClubHealthStatus
}

export const HealthStatusCell: React.FC<HealthStatusCellProps> = ({
  status,
}) => {
  const short = getClubHealthStatusShortLabel(status)
  const rest = getClubHealthStatusLabel(status).slice(short.length)
  return (
    <span className="dt-health">
      <StatusMarker status={status} />
      <span className="dt-health__label">
        {short}
        {rest && <span className="sr-only">{rest}</span>}
      </span>
    </span>
  )
}

export default HealthStatusCell
