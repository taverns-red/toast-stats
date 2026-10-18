/**
 * Per-region membership series for the /regions leaderboard sparklines
 * (#2127): ONE small file, `time-series/regions/{PY}.json`, for the page's
 * own program year (R3), bounded by its pinned date — not one district
 * series fetch per district (~94).
 *
 * Returns `'loading'` while the file loads (reserve the box), `null` when
 * it is not published (404 until it reaches prod: draw no sparkline), and
 * otherwise each region's values.
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCdnRegionMembershipSeries } from '../services/cdn'
import { regionTrendSeries } from '../utils/regionTrendSeries'
import type { RegionTrends } from '../components/RegionsLeaderboard'

export interface UseRegionTrendsResult {
  trends: RegionTrends
  /** True until the first answer (file or no file); never again after. */
  isPending: boolean
}

export function useRegionTrends(
  regionIds: readonly string[],
  /** "YYYY-YYYY", the page's program year (R3). */
  programYear: string,
  /** The page's pinned snapshot date; undefined = latest. */
  snapshotDate: string | undefined
): UseRegionTrendsResult {
  const query = useQuery({
    queryKey: ['region-membership-series', programYear] as const,
    queryFn: () => fetchCdnRegionMembershipSeries(programYear),
    staleTime: 15 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    // A program-year switch keeps the query answered (isPending stays
    // false after the first load, so the page never flashes its skeleton);
    // the previous year's lines are never drawn — see isPlaceholderData.
    placeholderData: prev => prev,
  })
  const series = query.isPlaceholderData ? undefined : query.data
  const trends = useMemo((): RegionTrends => {
    if (series === undefined) return 'loading'
    if (series === null) return null
    return new Map(
      regionIds.map(id => [id, regionTrendSeries(series, id, snapshotDate)])
    )
  }, [series, regionIds, snapshotDate])
  return { trends, isPending: query.isPending }
}
