import { useQuery } from '@tanstack/react-query'
import { fetchCdnSnapshotIndex } from '../services/cdn'

/**
 * Interface for cached dates response (CDN-compatible shape)
 */
export interface CachedDatesResponse {
  districtId: string
  dates: string[]
  count: number
  dateRange: {
    startDate: string
    endDate: string
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

      const index = await fetchCdnSnapshotIndex()
      const dates = (index[districtId] ?? []).sort()

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
