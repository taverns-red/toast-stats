/**
 * useClubChangeFeed (#2430) — the club page's "Recent changes" feed.
 *
 * Reads only EXISTING CDN files: the per-district snapshot index (shared
 * `district-cached-dates` entry, already read by the page) and about one
 * dated district snapshot a week over the last 90 days (`pickFeedDates`, at
 * most ~14 files). Each is reduced to the club's rows at fetch time, so the
 * cache holds a few KB per date, and the pure `buildClubChangeFeed` diffs the
 * sequence with the What Changed engine.
 *
 * A snapshot that 404s or failed collection resolves `null` — a gap the feed
 * bridges and reports — never a thrown query that blanks the panel.
 *
 * R3: district, club and as-of date are the page's own, passed in. `enabled`
 * is the page's gate (the panel nearing the viewport after the hero paints),
 * so a reader who never scrolls that far costs no extra reads.
 */
import { useMemo } from 'react'
import { useQueries, type UseQueryResult } from '@tanstack/react-query'
import type {
  DistrictStatisticsFile,
  PerDistrictData,
} from '@taverns-red/shared-contracts'
import { fetchCdnDistrictSnapshot } from '../services/cdn'
import { useDistrictCachedDates } from './useDistrictData'
import {
  buildClubChangeFeed,
  pickFeedDates,
  reduceSnapshotToClub,
  type ClubChangeFeed,
} from '../utils/clubChangeFeed'
import type { SnapshotDate } from '../types/snapshotDate'

export interface UseClubChangeFeedResult {
  /** Null until the gate opens and the reads settle. */
  feed: ClubChangeFeed | null
  /** True only while reads are in flight (never while gated off). */
  isLoading: boolean
}

/** Module-level so TanStack can keep the combined result stable. */
function combinePoints(
  results: readonly UseQueryResult<DistrictStatisticsFile | null>[]
) {
  return {
    pending: results.some(r => r.isPending),
    snapshots: results.map(r => r.data ?? null),
  }
}

export function useClubChangeFeed(
  districtId: string | undefined,
  clubId: string | undefined,
  asOfDate: SnapshotDate | null | undefined,
  enabled: boolean
): UseClubChangeFeedResult {
  const active = enabled && !!districtId && !!clubId && !!asOfDate
  const { data: cachedDates, isPending: isDatesPending } =
    useDistrictCachedDates(districtId ?? null, active)

  const picked = useMemo(
    () =>
      active && cachedDates ? pickFeedDates(cachedDates.dates, asOfDate!) : [],
    [active, cachedDates, asOfDate]
  )

  const points = useQueries({
    queries: picked.map(date => ({
      queryKey: ['club-change-feed-snapshot', districtId, date, clubId],
      queryFn: async (): Promise<DistrictStatisticsFile | null> => {
        try {
          const file = await fetchCdnDistrictSnapshot<PerDistrictData>(
            date,
            districtId!
          )
          if (file.status === 'failed' || !file.data) return null
          return reduceSnapshotToClub(file.data, clubId!)
        } catch {
          return null
        }
      },
      enabled: active,
      staleTime: 10 * 60 * 1000,
      retry: false,
    })),
    combine: combinePoints,
  })

  const feed = useMemo(() => {
    if (!active || isDatesPending || points.pending) return null
    return buildClubChangeFeed(
      picked.map((date, i) => ({
        date,
        snapshot: points.snapshots[i] ?? null,
      }))
    )
  }, [active, isDatesPending, points, picked])

  // Gated off is NOT loading: nothing is being read, so the panel must not
  // hold the page aria-busy while it waits off-screen (PR #2446 smoke).
  return {
    feed,
    isLoading: active && (isDatesPending || points.pending),
  }
}
