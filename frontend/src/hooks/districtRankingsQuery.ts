import { queryOptions } from '@tanstack/react-query'
import { fetchCdnRankings, fetchCdnRankingsForDate } from '../services/cdn'
import type { SnapshotDate } from '../types/snapshotDate'

/**
 * The `['district-rankings', date ?? 'latest']` query — one entry per rankings
 * file. Shared by `useDistrictRanking`, `useLatestAsOfDate`, and `useDistricts` (which
 * reads through it), so a page mounting several of them downloads the file
 * once (#1901: the club page fetched `v1/rankings.json` twice, under two keys).
 */
export function districtRankingsQueryOptions(date?: SnapshotDate) {
  return queryOptions({
    queryKey: ['district-rankings', date ?? 'latest'],
    queryFn: date ? () => fetchCdnRankingsForDate(date) : fetchCdnRankings,
    staleTime: 15 * 60 * 1000,
  })
}
