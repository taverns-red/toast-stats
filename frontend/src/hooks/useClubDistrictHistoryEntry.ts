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
   `enabled` lets the page hold the read until its first screen is up. */

export function useClubDistrictHistoryEntry(
  clubId: string | undefined,
  enabled: boolean
): { history: ClubDistrictHistoryClub | null; isLoading: boolean } {
  const shardKey = clubId ? clubDistrictHistoryShardKey(clubId) : null
  const { data, isLoading } = useQuery({
    queryKey: ['club-district-history', 'shard', shardKey ?? 'none'],
    queryFn: () => fetchClubDistrictHistoryShard(shardKey ?? ''),
    enabled: enabled && shardKey !== null,
    staleTime: 15 * 60 * 1000,
  })
  if (!data || !clubId) return { history: null, isLoading }
  return { history: findClubEntry(data.clubs, clubId) ?? null, isLoading }
}
