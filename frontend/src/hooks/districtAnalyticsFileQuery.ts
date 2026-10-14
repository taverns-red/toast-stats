import { queryOptions } from '@tanstack/react-query'
import { cdnAnalyticsUrl, fetchFromCdn } from '../services/cdn'
import type { DistrictAnalytics } from './useDistrictAnalytics'
import type { SnapshotDate } from '../types/snapshotDate'

/**
 * The raw `snapshots/{date}/analytics/district_{id}_analytics.json` payload,
 * one entry per file. `useDistrictAnalytics` and `useAggregatedAnalytics` both
 * read through it, so the hub (which mounts both) downloads the file once.
 * Before #2027 each fetched it under its own key.
 *
 * The cached object is shared: readers derive from it and must not mutate it.
 */
export function districtAnalyticsFileQueryOptions(
  districtId: string,
  date: SnapshotDate
) {
  return queryOptions({
    queryKey: ['district-analytics-file', districtId, date],
    queryFn: async (): Promise<DistrictAnalytics> => {
      const url = cdnAnalyticsUrl(date, districtId, 'analytics')
      const file = await fetchFromCdn<{ data: DistrictAnalytics }>(url)
      return file.data
    },
    staleTime: 10 * 60 * 1000,
  })
}
