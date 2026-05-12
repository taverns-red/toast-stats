/* clubAnniversary (#444) — derives years / milestone / proximity for
   a club from its charter date. Foundation utility for the
   Anniversaries epic (#443). Sprint A RED stub. */

export interface ClubAnniversary {
  /** Whole years since charter, measured against referenceDate. */
  years: number
  /** True for 5-year increments per the Toastmasters recognition set:
   *  5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100. */
  isMilestone: boolean
  /** Days until the next anniversary. Zero on the exact day. Negative
   *  values are not returned — daysUntilNext is always in [0, 365]. */
  daysUntilNext: number
  /** True iff the next anniversary is within ±30 days of referenceDate. */
  isUpcoming: boolean
  /** Whole-year mark that the next anniversary will celebrate.
   *  Equal to years on the exact anniversary day; otherwise years + 1. */
  upcomingYears: number
}

export function getClubAnniversary(
  _charterDate: string | Date,
  _referenceDate?: Date
): ClubAnniversary | null {
  throw new Error('getClubAnniversary: not implemented (RED phase, #444)')
}
