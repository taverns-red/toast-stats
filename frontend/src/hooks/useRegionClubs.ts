/**
 * One region's clubs for one date (#1808, data from #1800): the region's
 * own shard, `snapshots/<date>/clubs-by-region/<NN>.json`, and nothing
 * else — the explorer fetches no district file and no world file.
 *
 * The page passes its own resolved snapshot date (R3); there is no fetch
 * until it has one. A missing shard is `shard: null` ("not available for
 * this date yet"); a failed request is `isError`, which the page offers to
 * retry.
 */
import { useQuery } from '@tanstack/react-query'
import type { ClubsByRegionShard } from '@taverns-red/shared-contracts'
import { fetchCdnClubsByRegionShard } from '../services/cdn'
import type { SnapshotDate } from '../types/snapshotDate'

export interface UseRegionClubsResult {
  shard: ClubsByRegionShard | null
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

export function useRegionClubs(
  date: SnapshotDate | undefined,
  region: string
): UseRegionClubsResult {
  const query = useQuery({
    queryKey: ['clubs-by-region', date ?? '', region] as const,
    queryFn: () => fetchCdnClubsByRegionShard(date!, region),
    enabled: !!date && region !== '',
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
  return {
    shard: query.data ?? null,
    // Waiting on the page's date counts as loading, so the reserved
    // skeleton holds instead of flashing "not available".
    isLoading: query.isPending,
    isError: query.isError,
    refetch: () => void query.refetch(),
  }
}
