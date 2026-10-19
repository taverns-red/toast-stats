import React from 'react'
import type { ClubAnniversary } from '../utils/clubAnniversary'
import { ordinalSuffix } from '../utils/ordinal'

/* ClubAnniversaryBadge (#445, #2171) — the club hero's anniversary chip.

   #2171 (Ron, 2026-10-19): shown ONLY within 30 days of the anniversary,
   either side, in the hero's one quiet outline-chip style and without an
   emoji. Outside that window it renders nothing (the steady-state
   "<N> years" pill and the milestone medal are retired).

   - before the day: "<Nth> anniversary in X days"
   - on the day:     "<Nth> anniversary today"
   - just after:     "<Nth> anniversary X days ago"

   Renders nothing when anniversary is null (missing charter date). */

export interface ClubAnniversaryBadgeProps {
  anniversary: ClubAnniversary | null
  /** Charter date in display form for the tooltip. */
  charterDateLabel?: string
}

const days = (n: number): string => `${n} day${n === 1 ? '' : 's'}`

export const ClubAnniversaryBadge: React.FC<ClubAnniversaryBadgeProps> = ({
  anniversary,
  charterDateLabel,
}) => {
  if (!anniversary?.isUpcoming) return null

  const { years, daysUntilNext, daysSincePrev, upcomingYears } = anniversary

  // Inside the window the nearer side wins: the coming anniversary when it is
  // the closer one (or today), otherwise the one that just passed.
  const upcoming = daysUntilNext <= daysSincePrev
  const mark = upcoming ? upcomingYears : years
  const ord = `${mark}${ordinalSuffix(mark)}`
  const copy =
    daysUntilNext === 0 || daysSincePrev === 0
      ? `${ord} anniversary today`
      : upcoming
        ? `${ord} anniversary in ${days(daysUntilNext)}`
        : `${ord} anniversary ${days(daysSincePrev)} ago`

  return (
    <span className="club-hero__chip" title={charterDateLabel}>
      {copy}
      {charterDateLabel && (
        <span className="sr-only"> · Chartered {charterDateLabel}</span>
      )}
    </span>
  )
}
