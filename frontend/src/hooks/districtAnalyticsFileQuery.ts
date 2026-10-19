import { queryOptions } from '@tanstack/react-query'
import {
  expandDistrictAnalyticsClubLists,
  hasCoordinates,
} from '@taverns-red/shared-contracts'
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
 *
 * Files written since #1901 carry the three club category lists as clubId
 * lists; they are expanded here against `allClubs`, so every reader still sees
 * `vulnerableClubs` / `thrivingClubs` / `interventionRequiredClubs`. Older
 * files with full arrays pass through unchanged.
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
      return dropInvalidCoordinates(expandDistrictAnalyticsClubLists(file.data))
    },
    staleTime: 10 * 60 * 1000,
  })
}

/**
 * #2153 — files written before the Find-A-Club fix carry `(0, 0)` for a club
 * TI has not geocoded. The shared rule makes such a club unmapped, so the map
 * neither pins it at null island nor counts it as on the map. Runs on the
 * freshly fetched payload, before it is cached.
 */
function dropInvalidCoordinates(data: DistrictAnalytics): DistrictAnalytics {
  for (const list of [
    data.allClubs,
    data.vulnerableClubs,
    data.thrivingClubs,
    data.interventionRequiredClubs,
  ]) {
    for (const club of list ?? []) {
      if (club.coordinates && !hasCoordinates(club.coordinates))
        delete club.coordinates
    }
  }
  return data
}
