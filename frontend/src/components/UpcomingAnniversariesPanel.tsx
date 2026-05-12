import React from 'react'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'

/* UpcomingAnniversariesPanel (#446) — district-level recognition planner.
   Lists clubs with anniversaries in the next 60 days, sorted by date
   proximity. STUB — implementation lands in the GREEN commit. */

export const UPCOMING_WINDOW_DAYS = 60

export interface UpcomingAnniversariesPanelProps {
  clubs: ClubTrend[]
  /** Reference date for deterministic testing. Defaults to now. */
  referenceDate?: Date
  /** District id used for club detail links. */
  districtId?: string
  /** Initial visible row count before "Show all". */
  initialRowLimit?: number
}

export const UpcomingAnniversariesPanel: React.FC<
  UpcomingAnniversariesPanelProps
> = () => {
  return null
}
