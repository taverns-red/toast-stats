/**
 * The worldwide race to Distinguished, one query for the whole `/clubs`
 * area (#1556, spec §7).
 *
 * `snapshots/{date}/global-club-race.json` is the ONLY request the hub, the
 * per-tier race pages and the club page's standing card make; they share
 * this key, so navigating between subpages is free.
 *
 * A caller that has already resolved a snapshot date pins the query to it
 * (Lesson 59) so two "latest" resolutions can never straddle a publish;
 * otherwise the hook resolves latest itself. An absent artifact (a date
 * before the feature existed, or a date whose fold was skipped) is
 * `race: null`, which pages render as "not available for this date" — it is
 * not an error.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type {
  GlobalClubRace,
  GlobalClubRaceReached,
} from '@taverns-red/shared-contracts'
import {
  fetchCdnGlobalClubRace,
  fetchLatestSnapshotDate,
} from '../services/cdn'
import type { SnapshotDate } from '../types/snapshotDate'

export function globalClubRaceQueryKey(
  date: SnapshotDate | undefined
): readonly ['global-club-race', string] {
  return ['global-club-race', date ?? 'latest'] as const
}

export interface UseGlobalClubRaceResult {
  /** The published projection, or null when the artifact is not on the CDN. */
  race: GlobalClubRace | null
  /** The snapshot date the query is pinned to (resolved when not given). */
  snapshotDate: string | null
  /** Reached rows by canonical club id — O(1) for the club page's card. */
  reachedById: ReadonlyMap<string, GlobalClubRaceReached>
  isLoading: boolean
  isError: boolean
}

const EMPTY: ReadonlyMap<string, GlobalClubRaceReached> = new Map()

export function useGlobalClubRace(
  date?: SnapshotDate
): UseGlobalClubRaceResult {
  const query = useQuery<{ race: GlobalClubRace | null; date: string }>({
    queryKey: globalClubRaceQueryKey(date),
    queryFn: async () => {
      const resolved = date ?? (await fetchLatestSnapshotDate())
      return { race: await fetchCdnGlobalClubRace(resolved), date: resolved }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  const race = query.data?.race ?? null
  const reachedById = useMemo(() => {
    if (!race) return EMPTY
    return new Map(race.reached.map(row => [row.clubId, row]))
  }, [race])

  return {
    race,
    snapshotDate: query.data?.date ?? null,
    reachedById,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
