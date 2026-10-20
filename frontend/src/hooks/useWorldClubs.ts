/**
 * The world explorer's data (#1809, files from #1800): world.json first,
 * then — only when `wantShards` — the region shards it lists (all, or
 * the `?region=` ones), one query each, all in
 * flight at once (no waterfall; each is cached on its own, so narrowing or
 * widening `?region=` refetches nothing already loaded).
 *
 * The page passes its own resolved snapshot date (R3); nothing is fetched
 * until it has one. A missing world file is `world: null` ("not available
 * for this date yet"); a failed request is `isError`, which the page offers
 * to retry. `clubsReady` turns true once every wanted shard has settled, so
 * the map is built once, not once per shard.
 */
import { useMemo } from 'react'
import {
  useQueries,
  useQuery,
  type UseQueryResult,
} from '@tanstack/react-query'
import type {
  ClubsByRegionShard,
  ClubsByRegionWorld,
} from '@taverns-red/shared-contracts'
import {
  fetchCdnClubsByRegionShard,
  fetchCdnClubsByRegionWorld,
} from '../services/cdn'
import type { SnapshotDate } from '../types/snapshotDate'
import { worldShardKeys } from '../utils/worldClubs'

const STALE = 5 * 60 * 1000
const GC = 10 * 60 * 1000

export interface UseWorldClubsResult {
  world: ClubsByRegionWorld | null
  isLoading: boolean
  isError: boolean
  refetch: () => void
  /** The shards wanted: every region, or the `?region=` ones. */
  shardKeys: string[]
  /** The wanted shards, in `shardKeys` order; undefined until loaded. */
  shards: (ClubsByRegionShard | null | undefined)[]
  /** Every wanted shard has settled (loaded, missing or failed). */
  clubsReady: boolean
  /** The shard keys whose request failed. */
  failedShards: string[]
  retryShards: () => void
}

function combineShards(results: UseQueryResult<ClubsByRegionShard | null>[]) {
  return {
    shards: results.map(q => q.data),
    settled: results.every(q => q.isSuccess || q.isError),
    failed: results.map(q => q.isError),
    refetchFailed: () => {
      for (const q of results) if (q.isError) void q.refetch()
    },
  }
}

export function useWorldClubs(
  date: SnapshotDate | undefined,
  /** The page's `?region=` value ('' = every region). */
  regionParam: string,
  wantShards: boolean
): UseWorldClubsResult {
  const world = useQuery({
    queryKey: ['clubs-by-region-world', date ?? ''] as const,
    queryFn: () => fetchCdnClubsByRegionWorld(date!),
    enabled: !!date,
    staleTime: STALE,
    gcTime: GC,
  })
  const shardKeys = useMemo(
    () =>
      worldShardKeys(
        world.data ?? null,
        new URLSearchParams(regionParam ? { region: regionParam } : {})
      ),
    [world.data, regionParam]
  )
  const enabled = !!date && wantShards
  // `combine` is structurally shared: the same arrays until a shard lands,
  // so the page's memos rebuild once per shard, not once per render.
  const { shards, settled, failed, refetchFailed } = useQueries({
    queries: shardKeys.map(key => ({
      queryKey: ['clubs-by-region', date ?? '', key] as const,
      queryFn: () => fetchCdnClubsByRegionShard(date!, key),
      enabled,
      staleTime: STALE,
      gcTime: GC,
    })),
    combine: combineShards,
  })
  const failedShards = useMemo(
    () => shardKeys.filter((_, i) => failed[i]),
    [shardKeys, failed]
  )
  return {
    world: world.data ?? null,
    // Waiting on the page's date counts as loading, so the reserved
    // skeleton holds instead of flashing "not available".
    isLoading: world.isPending,
    isError: world.isError,
    refetch: () => void world.refetch(),
    shardKeys,
    shards,
    clubsReady: enabled && settled,
    failedShards,
    retryShards: refetchFailed,
  }
}
