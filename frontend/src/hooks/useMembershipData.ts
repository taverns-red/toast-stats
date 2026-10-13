import { queryOptions, useQuery } from '@tanstack/react-query'
import {
  fetchLatestSnapshotDate,
  fetchCdnDistrictSnapshot,
} from '../services/cdn'
import type { DistrictStatistics } from '../types/districts'
import type { SnapshotDate } from '../types/snapshotDate'

/**
 * React Query hook to fetch district statistics from CDN (#173).
 * Reads the raw district snapshot JSON.
 *
 * @param districtId - The district ID to fetch statistics for
 * @param selectedDate - Optional date in YYYY-MM-DD format. When provided, fetches
 *   that specific snapshot. When undefined, fetches the latest snapshot.
 * @param fields - Optional field selector (kept for API compatibility but CDN
 *   always returns the full snapshot).
 */
export const useDistrictStatistics = (
  districtId: string | null,
  selectedDate?: SnapshotDate,
  fields?: 'divisions' | 'clubs' | 'all'
) => {
  return useQuery({
    ...districtStatisticsQueryOptions(districtId, selectedDate, fields),
    enabled: !!districtId,
  })
}

/**
 * The `['districtStatistics', …]` query, shared by the hook above and the
 * entry prefetch (`services/routePrefetch.ts`, #1901). The key keeps its
 * 4-element shape — `fields` included even when undefined — because a
 * 3-element key hashes differently and would miss the prefetched entry.
 */
export function districtStatisticsQueryOptions(
  districtId: string | null,
  selectedDate?: SnapshotDate,
  fields?: 'divisions' | 'clubs' | 'all'
) {
  return queryOptions<DistrictStatistics, Error>({
    queryKey: ['districtStatistics', districtId, selectedDate, fields],
    queryFn: async () => {
      if (!districtId) {
        throw new Error('District ID is required')
      }
      const date = selectedDate || (await fetchLatestSnapshotDate())
      return fetchCdnDistrictSnapshot<DistrictStatistics>(date, districtId)
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
    retry: 2,
  })
}
