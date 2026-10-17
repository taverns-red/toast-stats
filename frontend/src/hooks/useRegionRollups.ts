/**
 * Region and world rollups for one date (#1815, data from #1799) — ONE
 * query for `/regions/health` and every `/region/:n/health`; they share this
 * key, so moving between them is free.
 *
 * The page passes its own resolved snapshot date (R3, Lesson 59); without
 * one the hook resolves latest itself. An absent artifact is `rollups:
 * null` — "not published for this date" — not an error.
 */
import { useQuery } from '@tanstack/react-query'
import type { RegionRollups } from '@taverns-red/shared-contracts'
import { fetchCdnRegionRollups, fetchLatestSnapshotDate } from '../services/cdn'
import type { SnapshotDate } from '../types/snapshotDate'

export function regionRollupsQueryKey(
  date: SnapshotDate | undefined
): readonly ['region-rollups', string] {
  return ['region-rollups', date ?? 'latest'] as const
}

export interface UseRegionRollupsResult {
  rollups: RegionRollups | null
  /** The snapshot date the query is pinned to (resolved when not given). */
  snapshotDate: string | null
  isLoading: boolean
}

export function useRegionRollups(
  date: SnapshotDate | undefined
): UseRegionRollupsResult {
  const query = useQuery<{ rollups: RegionRollups | null; date: string }>({
    queryKey: regionRollupsQueryKey(date),
    queryFn: async () => {
      const resolved = date ?? (await fetchLatestSnapshotDate())
      return { rollups: await fetchCdnRegionRollups(resolved), date: resolved }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
  return {
    rollups: query.data?.rollups ?? null,
    snapshotDate: query.data?.date ?? null,
    isLoading: query.isLoading,
  }
}
