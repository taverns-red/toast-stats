import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  districtClubShardKey,
  normalizeClubId,
  type DistrictReportsDataset,
} from '@taverns-red/shared-contracts'
import {
  fetchLatestSnapshotDate,
  cdnAnalyticsUrl,
  fetchFromCdn,
  fetchCdnDistrictReports,
  fetchCdnDistrictClubShard,
} from '../services/cdn'
import {
  applyDuesRenewalOverlay,
  buildDuesRenewalLookup,
} from '../utils/clubStatusOverlay'
import { applyCoachOverlay, buildCoachLookup } from '../utils/clubCoach'
import type {
  ClubTrend,
  DistrictAnalytics,
  DistrictAnalyticsWithReports,
} from './useDistrictAnalytics'
import type { SnapshotDate } from '../types/snapshotDate'

/**
 * A club's analytics neighbourhood, read for the club page (#1901).
 *
 * - `clubs`: the analytics `ClubTrend`s of the club's shard (the clubs whose
 *   id ends in the same digit), or the whole district's `allClubs` when it
 *   came from the district file, with the read-time overlays applied. The
 *   page finds its club in it; absent means not in the district that date.
 * - `districtReports`: the reports sidecar, for the page's education,
 *   compliance and coach sections (#1790).
 * - `source`: which file it came from — the club's shard, or the whole
 *   district file (a date with no shards yet, or a warm cache).
 */
export interface ClubAnalytics {
  clubs: ClubTrend[]
  districtReports: DistrictReportsDataset | null
  source: 'shard' | 'district'
}

/**
 * The club page's analytics read (#1901). It used to read the whole district
 * file (3.65 MB decoded for D61) to render one club; it now reads the club's
 * shard (`snapshots/<date>/analytics/district_<id>_clubs_<D>.json`, ≤ 120 KB
 * decoded). It falls back to the district file only when the shard is
 * missing or malformed, and reuses that file when the district pages have
 * already loaded it for the same date (the same query key, so no refetch).
 */
export const useClubAnalytics = (
  districtId: string | null,
  clubId: string | null,
  startDate?: string,
  endDate?: SnapshotDate,
  options: { enabled?: boolean } = {}
) => {
  const { enabled = true } = options
  const queryClient = useQueryClient()
  const hasValidDateRange = !startDate || !endDate || startDate <= endDate
  const canonicalId = normalizeClubId(clubId)

  return useQuery<ClubAnalytics, Error>({
    queryKey: ['clubAnalytics', districtId, canonicalId, startDate, endDate],
    queryFn: async () => {
      if (!districtId || !clubId) {
        throw new Error('District and club IDs are required')
      }
      // Warm cache: the district pages share this key with useDistrictAnalytics.
      const warm = queryClient.getQueryData<DistrictAnalyticsWithReports>([
        'districtAnalytics',
        districtId,
        startDate,
        endDate,
      ])
      if (warm) {
        return {
          clubs: warm.allClubs ?? [],
          districtReports: warm.districtReports ?? null,
          source: 'district',
        }
      }

      const snapshotDate = endDate || (await fetchLatestSnapshotDate())
      const shardKey = districtClubShardKey(canonicalId)
      const [shard, reports] = await Promise.all([
        shardKey
          ? fetchCdnDistrictClubShard(snapshotDate, districtId, shardKey)
          : Promise.resolve(null),
        fetchCdnDistrictReports(snapshotDate, districtId),
      ])

      let clubs: ClubTrend[]
      let source: ClubAnalytics['source']
      if (shard) {
        clubs = shard.clubs as unknown as ClubTrend[]
        source = 'shard'
      } else {
        const file = await fetchFromCdn<{ data: DistrictAnalytics }>(
          cdnAnalyticsUrl(snapshotDate, districtId, 'analytics')
        )
        clubs = file.data.allClubs ?? []
        source = 'district'
      }

      // The same overlays, from the same sidecar, as useDistrictAnalytics.
      if (reports) {
        applyDuesRenewalOverlay(
          clubs,
          buildDuesRenewalLookup(reports, snapshotDate)
        )
        applyCoachOverlay(clubs, buildCoachLookup(reports))
      }
      return { clubs, districtReports: reports, source }
    },
    enabled: enabled && !!districtId && !!clubId && hasValidDateRange,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: (failureCount, error: unknown) => {
      if (error && typeof error === 'object' && 'response' in error) {
        const status = (error as { response?: { status?: number } }).response
          ?.status
        if (status === 404 || status === 400) return false
      }
      return failureCount < 2
    },
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
}
