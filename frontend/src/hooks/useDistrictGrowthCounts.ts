import { useQuery } from '@tanstack/react-query'
import { fetchCdnRankingsForDate } from '../services/cdn'
import type { SnapshotDate } from '../types/snapshotDate'
import { readGrowthCounts, type GrowthCounts } from '../utils/clubGrowthFunnel'

/* #1794 — the district's charter + suspension counts for the DISPLAYED
   snapshot (R3). Shares the `['district-rankings', date]` cache entry with
   `useDistrictRanking`, but needs the whole file, not the row: telling a
   measured 0 from "not collected" is a census-wide test (#1501, #1757). */

const UNKNOWN: GrowthCounts = { chartered: null, suspended: null }

export function useDistrictGrowthCounts(
  districtId: string | undefined,
  date: SnapshotDate | undefined
): { counts: GrowthCounts; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['district-rankings', date ?? 'none'],
    queryFn: () => {
      if (!date) throw new Error('A snapshot date is required')
      return fetchCdnRankingsForDate(date)
    },
    enabled: Boolean(date),
    staleTime: 15 * 60 * 1000,
  })

  // A per-date 404 falls back to latest with `snapshotDate` unset — another
  // date's counts are never a substitute (same guard as useDistrictRanking).
  if (!data || !districtId || data.snapshotDate !== date) {
    return { counts: UNKNOWN, isLoading }
  }
  return { counts: readGrowthCounts(data.rankings, districtId), isLoading }
}
