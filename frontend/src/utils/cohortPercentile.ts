/**
 * Cohort percentile for the club page (#1556, spec §5 mechanic 2).
 *
 * The one worldwide number every club gets, and the only one a club that
 * has not reached a line ever sees: "top X % of clubs worldwide by goals
 * met · top Y % among clubs with 20–24 members". Computed from the
 * artifact's histograms (11 + 4 × 11 numbers), so no per-club list and no
 * bottom exist anywhere — a club is never told it is 11,204th.
 *
 * "Top X %" = share of the cohort at or above the club's goals, rounded UP,
 * so a club is never told it is better than it is. An empty cohort is
 * `null`, never 100 %.
 */

import type {
  GlobalClubRaceDistribution,
  GlobalClubRaceMembershipBands,
} from '@taverns-red/shared-contracts'

export type MembershipBand = keyof GlobalClubRaceMembershipBands

export interface CohortPercentile {
  band: MembershipBand
  cohortSize: number
  /** Top X % of all clubs scanned, by goals met; null when nothing was scanned. */
  topPercentOverall: number | null
  /** Top Y % within the club's membership band; null when the band is empty. */
  topPercentInBand: number | null
}

/** Same boundaries the artifact buckets on (12, 20, 25). */
export function membershipBand(members: number): MembershipBand {
  if (members < 12) return 'lt12'
  if (members < 20) return 'from12to19'
  if (members < 25) return 'from20to24'
  return 'ge25'
}

const BAND_LABELS: Record<MembershipBand, string> = {
  lt12: 'fewer than 12 members',
  from12to19: '12–19 members',
  from20to24: '20–24 members',
  ge25: '25 or more members',
}

export function membershipBandLabel(band: MembershipBand): string {
  return BAND_LABELS[band]
}

/**
 * Share (%) of `histogram` at or above `goalsMet`, rounded up, with the
 * club itself counted so an empty stretch above never reads as 0 %.
 */
function topPercent(
  histogram: readonly number[],
  goalsMet: number
): number | null {
  const total = histogram.reduce((a, b) => a + b, 0)
  if (total === 0) return null
  const bucket = Math.min(10, Math.max(0, Math.trunc(goalsMet)))
  const atOrAbove = histogram.slice(bucket).reduce((a, b) => a + b, 0)
  return Math.min(100, Math.ceil((Math.max(1, atOrAbove) / total) * 100))
}

export function cohortPercentile(
  distribution: GlobalClubRaceDistribution,
  goalsMet: number,
  members: number
): CohortPercentile {
  const band = membershipBand(members)
  const cohort = distribution.cohorts[band]
  return {
    band,
    cohortSize: cohort.reduce((a, b) => a + b, 0),
    topPercentOverall: topPercent(distribution.goalsMet, goalsMet),
    topPercentInBand: topPercent(cohort, goalsMet),
  }
}
