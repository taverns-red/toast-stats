/* Division and area Distinguished counts, split into confirmed and
   qualifying-today (#2580).

   The snapshot's per-division and per-area `distinguishedClubs` counts every
   club that holds a level today, so it includes the clubs whose level April
   renewals do not yet confirm. Confirmed is the headline (Ron, 2026-11-08);
   the rest shows beside it as "+N qualifying today" and is never added in.

   `distinguishedClubs` keeps its meaning (qualifying today): the recognition
   status, the gap columns and the narratives all derive from it and are not a
   count display. The provisional part rides beside it as
   `provisionalDistinguishedClubs`, derived from the district's club rows with
   the same per-club rule as the district KPI (`isProvisionallyDistinguished`). */

import type { ClubTrend } from '../hooks/useDistrictAnalytics'
import type { DivisionPerformance } from './divisionStatus'
import { isProvisionallyDistinguished } from './provisionalDistinguished'

interface DistinguishedSplit {
  distinguishedClubs: number
  provisionalDistinguishedClubs?: number | undefined
}

/** The confirmed count: qualifying today minus the provisional part. */
export function confirmedDistinguished(x: DistinguishedSplit): number {
  return Math.max(
    0,
    x.distinguishedClubs - (x.provisionalDistinguishedClubs ?? 0)
  )
}

/** The provisional part, or 0 when unknown. */
export function provisionalOf(x: DistinguishedSplit): number {
  return x.provisionalDistinguishedClubs ?? 0
}

const capped = (provisional: number, today: number): number =>
  Math.min(provisional, Math.max(0, today))

/**
 * Attach each division's and area's provisional Distinguished count.
 *
 * Without club rows (still loading, or the read failed) the divisions come
 * back as they were: the count then stands as the snapshot reports it, with no
 * extra, rather than guessing a split.
 */
export function withProvisionalDistinguished(
  divisions: DivisionPerformance[],
  clubs: readonly ClubTrend[] | undefined,
  snapshotDate: string
): DivisionPerformance[] {
  if (!clubs) return divisions

  const byDivision = new Map<string, number>()
  const byArea = new Map<string, number>()
  for (const club of clubs) {
    if (
      !club.distinguishedLevel ||
      club.distinguishedLevel === 'NotDistinguished'
    ) {
      continue
    }
    if (!isProvisionallyDistinguished(club, snapshotDate)) continue
    const div = club.divisionId.toUpperCase()
    byDivision.set(div, (byDivision.get(div) ?? 0) + 1)
    const area = `${div}|${club.areaId.toUpperCase()}`
    byArea.set(area, (byArea.get(area) ?? 0) + 1)
  }

  return divisions.map(division => {
    const div = division.divisionId.toUpperCase()
    return {
      ...division,
      provisionalDistinguishedClubs: capped(
        byDivision.get(div) ?? 0,
        division.distinguishedClubs
      ),
      areas: division.areas.map(area => ({
        ...area,
        provisionalDistinguishedClubs: capped(
          byArea.get(`${div}|${area.areaId.toUpperCase()}`) ?? 0,
          area.distinguishedClubs
        ),
      })),
    }
  })
}
