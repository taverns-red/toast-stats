import { useMemo } from 'react'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { usePublishedThrough } from './usePublishedThrough'
import { snapshotIndexQueryOptions } from './snapshotIndexQuery'
import { snapshotDatesFrom, type SnapshotDate } from '../types/snapshotDate'
import { capDatesAtPublished } from '../utils/publishedDates'

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
  /** Every date in the index, held ones included. Set by `useDistrictCachedDates`
   * only when it capped `dates` at `v1/latest.json`; absent otherwise. Use it
   * for the date picker and to validate an explicit `?date=`. */
  allDates?: SnapshotDate[]
}

/** The hook's view of the index: `dates` and `dateRange` stop at the manifest
 * date, so a date whose reports are held is never a page's default (#3195). */
function capCachedDates(
  data: CachedDatesResponse | undefined,
  publishedThrough: SnapshotDate | undefined
): CachedDatesResponse | undefined {
  if (!data) return data
  const dates = capDatesAtPublished(data.dates, publishedThrough)
  if (dates === data.dates) return data
  return {
    ...data,
    dates,
    allDates: data.dates,
    count: dates.length,
    dateRange: { startDate: dates[0]!, endDate: dates[dates.length - 1]! },
  }
}

/**
 * The `['district-cached-dates', districtId]` query, shared by the hook below
 * and the entry prefetch (`services/routePrefetch.ts`, #1901) so a prefetched
 * index lands in the exact entry the page reads.
 */
export function districtCachedDatesQueryOptions(districtId: string | null) {
  return queryOptions<CachedDatesResponse, Error>({
    queryKey: ['district-cached-dates', districtId],
    queryFn: async ({ client }) => {
      if (!districtId) {
        throw new Error('District ID is required')
      }

      // The per-district snapshot index is the pipeline's own enumeration of the
      // snapshots it wrote for this district — the district-side mint for the
      // brand (#1323), the sibling of useProgramYearControls' dates-index mint.
      // Read through the shared index entry (#2027) — the hub's club-growth
      // card reads the same file, and fetchQuery joins an in-flight request.
      const index = await client.fetchQuery(snapshotIndexQueryOptions())
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
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: failureCount => failureCount < 2,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
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
  const isEnabled = enabled && !!districtId
  const query = useQuery({
    ...districtCachedDatesQueryOptions(districtId),
    enabled: isEnabled,
  })
  const { publishedThrough } = usePublishedThrough(isEnabled)
  const data = useMemo(
    () => capCachedDates(query.data, publishedThrough),
    [query.data, publishedThrough]
  )
  return { ...query, data }
}
