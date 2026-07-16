import { useQuery } from '@tanstack/react-query'
import { fetchCdnSnapshotIndex } from '../services/cdn'
import { snapshotDatesFrom, type SnapshotDate } from '../types/snapshotDate'

/**
 * Interface for cached dates response (CDN-compatible shape)
 */
export interface CachedDatesResponse {
  districtId: string
  dates: SnapshotDate[]
  count: number
  dateRange: {
    startDate: SnapshotDate
    endDate: SnapshotDate
  } | null
}

/**
 * Hook to fetch all cached dates for a district from CDN (#173).
 * Reads the snapshot index and filters by districtId.
 *
 * @param districtId - The district ID to fetch cached dates for
 * @param enabled - Whether the query should be enabled (default: true)
 * @returns Query result with cached dates and date range
 */
export const useDistrictCachedDates = (
  districtId: string | null,
  enabled: boolean = true
) => {
  return useQuery<CachedDatesResponse, Error>({
    queryKey: ['district-cached-dates', districtId],
    queryFn: async () => {
      if (!districtId) {
        throw new Error('District ID is required')
      }

      // The per-district snapshot index is the pipeline's own enumeration of the
      // snapshots it wrote for this district — the district-side mint for the
      // brand (#1323), the sibling of useProgramYearControls' dates-index mint.
      const index = await fetchCdnSnapshotIndex()
      const dates = snapshotDatesFrom({
        dates: index[districtId] ?? [],
      }).sort()

      return {
        districtId,
        dates,
        count: dates.length,
        dateRange:
          dates.length > 0
            ? {
                startDate: dates[0]!,
                endDate: dates[dates.length - 1]!,
              }
            : null,
      }
    },
    enabled: enabled && !!districtId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: failureCount => failureCount < 2,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
}
