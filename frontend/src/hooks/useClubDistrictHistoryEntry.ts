import { useQuery } from '@tanstack/react-query'
import {
  clubDistrictHistoryShardKey,
  findClubEntry,
  type ClubDistrictHistoryClub,
} from '@taverns-red/shared-contracts'
import { fetchClubDistrictHistoryShard } from '../services/cdnClubDistrictHistory'

/* #1843 — ONE club's district history (#1782) for the club page's
   Lifecycle timeline: the single shard holding the club (≈ 12 KB gzip),
   through the #1817 reader. The query key is the one
   `useClubDistrictHistory` uses per shard, so the two share the cache.

   `history` is `null` when the shard is absent, off contract, or does not
   list the club; the panel then says the district history is not available.
   `enabled` lets the page hold the read until its first screen is up.

   #2076 — `isLoading` stays true until the read has SETTLED, including while
   `enabled` is still false. A read that has not started is not a read that
   found nothing: reporting it as done let the panel say the history was
   missing, and then be torn down when the read actually started. */

/** The shard query, shared with readers outside React render (#1803's
    `useClubHistory` reads it via `ensureQueryData`) so every reader hits
    one cache entry per shard — the key `useClubDistrictHistory` uses. */
export function clubDistrictHistoryShardQuery(shardKey: string) {
  return {
    queryKey: ['club-district-history', 'shard', shardKey] as const,
    queryFn: () => fetchClubDistrictHistoryShard(shardKey),
    staleTime: 15 * 60 * 1000,
  }
}

export function useClubDistrictHistoryEntry(
  clubId: string | undefined,
  enabled: boolean
): { history: ClubDistrictHistoryClub | null; isLoading: boolean } {
  const shardKey = clubId ? clubDistrictHistoryShardKey(clubId) : null
  const { data, isPending } = useQuery({
    ...clubDistrictHistoryShardQuery(shardKey ?? 'none'),
    enabled: enabled && shardKey !== null,
  })
  // TanStack's `isPending` is "no data and no error yet" — true for a
  // disabled query too, unlike `isLoading` (pending AND fetching).
  const isLoading = shardKey !== null && isPending
  if (!data || !clubId) return { history: null, isLoading }
  return { history: findClubEntry(data.clubs, clubId) ?? null, isLoading }
}
