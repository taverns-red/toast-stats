import React from 'react'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'

export interface NotableDatesSectionProps {
  clubs: ClubTrend[]
  districtId?: string
  programYearStart?: number
  referenceDate?: Date
}

/**
 * NotableDatesSection — orchestrator for UpcomingAnniversariesPanel and
 * MilestonesCallout. Decides whether to render side-by-side, full-width
 * single panel, or a single compact "no notable dates" band.
 *
 * STUB (TDD red).
 */
export const NotableDatesSection: React.FC<NotableDatesSectionProps> = () => {
  return null
}

export default NotableDatesSection
