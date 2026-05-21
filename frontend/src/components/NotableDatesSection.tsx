import React, { useMemo } from 'react'
import type { ClubTrend } from '../hooks/useDistrictAnalytics'
import { getCurrentProgramYear } from '../utils/programYear'
import {
  UpcomingAnniversariesPanel,
  hasUpcomingAnniversaries,
} from './UpcomingAnniversariesPanel'
import {
  MilestonesCallout,
  hasProgramYearMilestones,
} from './MilestonesCallout'

export interface NotableDatesSectionProps {
  clubs: ClubTrend[]
  districtId?: string
  /**
   * Program year start year (e.g. 2025 for PY 2025-26). Falls back to
   * the current program year when omitted.
   */
  programYearStart?: number
  /**
   * Reference date for "upcoming" anniversary calculation. Falls back
   * to `now` inside `getClubAnniversary`.
   */
  referenceDate?: Date
}

const formatProgramYearLabel = (start: number): string =>
  `${start}-${(start + 1).toString().slice(-2)}`

/**
 * Orchestrates UpcomingAnniversariesPanel and MilestonesCallout:
 *
 * | upcoming | milestones | layout                                    |
 * |----------|------------|-------------------------------------------|
 * | empty    | empty      | single compact band                       |
 * | populated| empty      | full-width upcoming panel                 |
 * | empty    | populated  | full-width milestones panel               |
 * | populated| populated  | side-by-side grid (md+) / stacked (sm)    |
 */
export const NotableDatesSection: React.FC<NotableDatesSectionProps> = ({
  clubs,
  districtId,
  programYearStart,
  referenceDate,
}) => {
  const upcomingPresent = useMemo(
    () => hasUpcomingAnniversaries(clubs, referenceDate),
    [clubs, referenceDate]
  )
  const milestonesPresent = useMemo(
    () => hasProgramYearMilestones(clubs, programYearStart),
    [clubs, programYearStart]
  )

  if (!upcomingPresent && !milestonesPresent) {
    const pyLabel = formatProgramYearLabel(
      programYearStart ?? getCurrentProgramYear().year
    )
    return (
      <section
        data-testid="notable-dates-empty-band"
        className="redesign-panel py-2"
        aria-label="No upcoming anniversaries or milestones"
      >
        <p className="text-xs text-gray-500 dark:text-gray-400 font-tm-body">
          <span aria-hidden="true" className="mr-1">
            ○
          </span>
          No upcoming anniversaries or milestones for PY {pyLabel}.
        </p>
      </section>
    )
  }

  if (upcomingPresent && milestonesPresent) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <UpcomingAnniversariesPanel
          clubs={clubs}
          {...(districtId !== undefined && { districtId })}
          {...(referenceDate && { referenceDate })}
        />
        <MilestonesCallout
          clubs={clubs}
          {...(districtId !== undefined && { districtId })}
          {...(programYearStart !== undefined && { programYearStart })}
        />
      </div>
    )
  }

  if (upcomingPresent) {
    return (
      <UpcomingAnniversariesPanel
        clubs={clubs}
        {...(districtId !== undefined && { districtId })}
        {...(referenceDate && { referenceDate })}
      />
    )
  }

  return (
    <MilestonesCallout
      clubs={clubs}
      {...(districtId !== undefined && { districtId })}
      {...(programYearStart !== undefined && { programYearStart })}
    />
  )
}

export default NotableDatesSection
