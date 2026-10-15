import { useQueries, useQuery } from '@tanstack/react-query'
import type {
  ClubDistrictHistoryClub,
  ClubDistrictHistoryIndex,
  ClubDistrictHistoryShard,
} from '@taverns-red/shared-contracts'
import {
  fetchClubDistrictHistoryIndex,
  fetchClubDistrictHistoryShard,
} from '../services/cdnClubDistrictHistory'

/* #1817 — the whole club-district history (#1782): the index, then every
   shard it names (100, ~1.2 MB over the wire in total, edge-compressed).
   Only a page that needs every club (charter cohort survival) uses this; a
   page about one club fetches its one shard.

   `status`:
   - `loading` — the index or a shard is in flight (`loaded` of `total` lets
     the page say how far along it is);
   - `ready` — every shard arrived and validated; `clubs` is the full map;
   - `unavailable` — the index or any shard is missing or invalid. A fold
     over a partial history would undercount, so `clubs` stays `null`. */

export type ClubDistrictHistoryStatus = 'loading' | 'ready' | 'unavailable'

export interface ClubDistrictHistoryState {
  status: ClubDistrictHistoryStatus
  loaded: number
  total: number
  index: ClubDistrictHistoryIndex | null
  clubs: Record<string, ClubDistrictHistoryClub> | null
}

const STALE_MS = 15 * 60 * 1000

interface ShardsResult {
  loaded: number
  pending: boolean
  missing: boolean
  clubs: Record<string, ClubDistrictHistoryClub> | null
}

function combineShards(
  results: { data: ClubDistrictHistoryShard | null | undefined }[]
): ShardsResult {
  let loaded = 0
  let missing = false
  for (const r of results) {
    if (r.data === undefined) continue
    loaded++
    if (r.data === null) missing = true
  }
  const pending = loaded < results.length
  if (pending || missing) return { loaded, pending, missing, clubs: null }
  const clubs: Record<string, ClubDistrictHistoryClub> = {}
  for (const r of results) Object.assign(clubs, r.data?.clubs)
  return { loaded, pending, missing, clubs }
}

export function useClubDistrictHistory(): ClubDistrictHistoryState {
  const indexQuery = useQuery({
    queryKey: ['club-district-history', 'index'],
    queryFn: fetchClubDistrictHistoryIndex,
    staleTime: STALE_MS,
  })
  const index = indexQuery.data ?? null
  const shardKeys = index?.shards ?? []

  const shards = useQueries({
    queries: shardKeys.map(key => ({
      queryKey: ['club-district-history', 'shard', key],
      queryFn: () => fetchClubDistrictHistoryShard(key),
      staleTime: STALE_MS,
    })),
    combine: combineShards,
  })

  const total = shardKeys.length
  if (indexQuery.data === null || indexQuery.isError) {
    return {
      status: 'unavailable',
      loaded: 0,
      total: 0,
      index: null,
      clubs: null,
    }
  }
  if (!index || shards.pending) {
    return {
      status: 'loading',
      loaded: shards.loaded,
      total,
      index,
      clubs: null,
    }
  }
  if (shards.missing || !shards.clubs) {
    return {
      status: 'unavailable',
      loaded: shards.loaded,
      total,
      index,
      clubs: null,
    }
  }
  return { status: 'ready', loaded: total, total, index, clubs: shards.clubs }
}
