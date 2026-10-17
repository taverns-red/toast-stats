import { useQuery } from '@tanstack/react-query'
import {
  clubDistrictHistoryShardKey,
  findClubEntry,
  type ClubDistrictHistoryClub,
} from '@taverns-red/shared-contracts'
import { clubDistrictHistoryShardQuery } from './clubDistrictHistoryQuery'

/* #1843 — ONE club's district history (#1782) for the club page's
   Lifecycle timeline: the single shard holding the club (≈ 12 KB gzip),
   through the #1817 reader and the one shard query every history reader
   shares (#2073), so they all hit one cache entry per shard.

   `history` is `null` when the shard is absent, off contract, or does not
   list the club; the panel then says the district history is not available.
   `isShardAvailable` (#1804) tells those apart: true when the shard arrived
   and validated, so a `null` history means "no club with this number has
   been seen since the history began", not "unknown".
   `enabled` lets the page hold the read until its first screen is up.

   #2076 — `isLoading` stays true until the read has SETTLED, including while
   `enabled` is still false. A read that has not started is not a read that
   found nothing: reporting it as done let the panel say the history was
   missing, and then be torn down when the read actually started. */

/** The shard query (#2073: one definition, `clubDistrictHistoryQuery`),
    re-exported for readers outside React render (#1803's `useClubHistory`
    reads it via `ensureQueryData`). */
export { clubDistrictHistoryShardQuery }

export function useClubDistrictHistoryEntry(
  clubId: string | undefined,
  enabled: boolean
): {
  history: ClubDistrictHistoryClub | null
  isLoading: boolean
  isShardAvailable: boolean
} {
  const shardKey = clubId ? clubDistrictHistoryShardKey(clubId) : null
  const { data, isPending } = useQuery({
    ...clubDistrictHistoryShardQuery(shardKey ?? 'none'),
    enabled: enabled && shardKey !== null,
  })
  // TanStack's `isPending` is "no data and no error yet" — true for a
  // disabled query too, unlike `isLoading` (pending AND fetching).
  const isLoading = shardKey !== null && isPending
  if (!data || !clubId)
    return { history: null, isLoading, isShardAvailable: false }
  return {
    history: findClubEntry(data.clubs, clubId) ?? null,
    isLoading,
    isShardAvailable: true,
  }
}
