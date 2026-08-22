/**
 * useDistrictRankHistoryYears — the program years a district appears in,
 * derived from its RANK HISTORY rather than its snapshots (#1436).
 *
 * `useDistrictCachedDates` is the normal year source, and it is already
 * per-district: it reads `district-snapshot-index.json`. But DistrictDetailPage's
 * degraded "limited data" branch is only reachable for a district that has NO
 * entry in that index — a district that DOES have one self-heals to its newest
 * data year via the page's auto-select effect (#1398) and never degrades. For
 * the degraded case `index[id] ?? []` is empty, so a selector fed from the
 * snapshot index would render with nothing in it and fix nothing.
 *
 * The rank history is the record of where such a district actually appears:
 * `v1/rank-history/{id}.json` is written for EVERY district that ever appeared
 * in any `all-districts-rankings.json` (data-pipeline.yml, "Building
 * per-district rank history"). That is exactly the population that can reach the
 * degraded view with something to show — `GlobalRankingsTab`, already rendered
 * there, reads the same file.
 */

import { useMemo } from 'react'
import { useRankHistory } from './useRankHistory'
import { getAvailableProgramYears } from '../utils/programYear'
import type { ProgramYear } from '../utils/programYear'

/**
 * Pure: the distinct program years covered by a district's rank-history points,
 * newest first. Unparseable dates are dropped by `getAvailableProgramYears`
 * rather than minting a `NaN-NaN` year (#1353) — the history is CDN JSON and is
 * not schema-validated on the way in.
 */
export function programYearsFromRankHistory(
  history: ReadonlyArray<{ date: string }>
): ProgramYear[] {
  return getAvailableProgramYears(history.map(point => point.date))
}

export interface DistrictRankHistoryYears {
  programYears: ProgramYear[]
  isLoading: boolean
}

/**
 * @param districtId - District whose rank history to read.
 * @param enabled - Gate the request. Callers pass `true` only once the snapshot
 *   index has resolved EMPTY for this district, so the happy path issues no
 *   extra fetch.
 */
export function useDistrictRankHistoryYears(
  districtId: string | undefined,
  enabled: boolean
): DistrictRankHistoryYears {
  const districtIds = useMemo(
    () => (enabled && districtId ? [districtId] : []),
    [enabled, districtId]
  )
  const active = districtIds.length > 0

  // No date bounds — the whole history is wanted, which is what makes the year
  // list complete. `useRankHistory` is itself gated on a non-empty id list.
  const { data, isLoading } = useRankHistory({ districtIds })

  const programYears = useMemo(
    () => programYearsFromRankHistory(data?.[0]?.history ?? []),
    [data]
  )

  return { programYears, isLoading: active ? isLoading : false }
}
