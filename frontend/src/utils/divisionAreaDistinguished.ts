/* Division and area Distinguished counts on the confirmed basis (#2580).

   The pipeline publishes each division's and area's confirmed and provisional
   counts (`distinguishedCountsByDivision`, #2553), classified per club by the
   same rule as the district KPI, so the divisions sum to it. This overlays
   them on the snapshot-derived rows for the division and area surfaces only.

   On the rows this returns, `distinguishedClubs` is the CONFIRMED count and
   `provisionalDistinguishedClubs` is the "+N qualifying today" beside it. The
   recognition status and `recognitionState` are re-derived from the confirmed
   count, so a surface never shows a "Distinguished" badge beside a pill that
   has not reached its threshold. The shared `extractDivisionPerformance`
   meaning (qualifying today) is untouched for every other consumer. */

import type { DivisionDistinguishedCountsRow } from '../hooks/useDistrictAnalytics'
import {
  calculateAreaStatus,
  calculateDivisionStatus,
  type AreaPerformance,
  type DivisionPerformance,
} from './divisionStatus'
import { deriveAreaRecognitionState } from './areaRecognitionState'

interface DistinguishedSplit {
  /** The confirmed count on the overlaid surfaces. */
  distinguishedClubs: number
  provisionalDistinguishedClubs?: number | undefined
}

/** The provisional part, or 0 when unknown. */
export function provisionalOf(x: DistinguishedSplit): number {
  return x.provisionalDistinguishedClubs ?? 0
}

/** "3 of 10 distinguished", with " (+2 qualifying today)" when some clubs are
 *  not yet confirmed. The narratives use it for their metrics clause. */
export function describeDistinguished(
  x: DistinguishedSplit,
  clubBase: number
): string {
  const extra =
    provisionalOf(x) > 0 ? ` (+${provisionalOf(x)} qualifying today)` : ''
  return `${x.distinguishedClubs} of ${clubBase} distinguished${extra}`
}

function overlayArea(
  area: AreaPerformance,
  counts: { confirmed: number; provisional: number },
  snapshotDate: string
): AreaPerformance {
  const confirmed = counts.confirmed
  return {
    ...area,
    distinguishedClubs: confirmed,
    provisionalDistinguishedClubs: counts.provisional,
    status: calculateAreaStatus(
      area.isQualified,
      confirmed,
      area.requiredDistinguishedClubs,
      area.paidClubs,
      area.clubBase,
      area.netGrowth
    ),
    recognitionState: deriveAreaRecognitionState({
      clubBase: area.clubBase,
      paidClubs: area.paidClubs,
      distinguishedClubs: confirmed,
      firstRoundVisitMet: area.firstRoundVisits.meetsThreshold,
      secondRoundVisitMet: area.secondRoundVisits.meetsThreshold,
      snapshotDate,
    }),
  }
}

/**
 * Put the published confirmed / provisional counts on each division and area.
 *
 * Without the field (files written before it existed) the divisions come back
 * as they were: the snapshot count stands, with no extra. A division or area
 * the field does not list is left as it was.
 */
export function applyPipelineDistinguished(
  divisions: DivisionPerformance[],
  published: readonly DivisionDistinguishedCountsRow[] | undefined,
  snapshotDate: string
): DivisionPerformance[] {
  if (!published) return divisions
  const byId = new Map(published.map(d => [d.divisionId.toUpperCase(), d]))

  return divisions.map(division => {
    const row = byId.get(division.divisionId.toUpperCase())
    if (!row) return division
    const areaCounts = new Map(
      row.areas.map(a => [a.areaId.toUpperCase(), a.distinguishedCounts])
    )
    const confirmed = row.distinguishedCounts.confirmed
    return {
      ...division,
      distinguishedClubs: confirmed,
      provisionalDistinguishedClubs: row.distinguishedCounts.provisional,
      status: calculateDivisionStatus(
        confirmed,
        division.paidClubs,
        division.clubBase
      ),
      areas: division.areas.map(area => {
        const counts = areaCounts.get(area.areaId.toUpperCase())
        return counts ? overlayArea(area, counts, snapshotDate) : area
      }),
    }
  })
}
