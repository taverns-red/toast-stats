import React from 'react'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'

/* MilestonesCallout (#447) — district-level program-year milestone roster.
   Groups clubs hitting a 5/10/15/.../100 year milestone within the current
   program year (Jul 1 – Jun 30). STUB — implementation lands in GREEN. */

export interface MilestonesCalloutProps {
  clubs: ClubTrend[]
  /** Program year start year (e.g. 2025 for the 2025-2026 PY). Defaults
   *  to the current PY. */
  programYearStart?: number
  /** District id used for club detail links. */
  districtId?: string
}

export const MilestonesCallout: React.FC<MilestonesCalloutProps> = () => {
  return null
}
