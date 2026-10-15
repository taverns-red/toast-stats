/* The one TanStack Query definition for a club-district history shard
   (#1782 → #1806), shared by every reader (Changes-feed transfers, the
   omni-search closed-club fallback) so they hit one cache entry per shard.

   The reader module is dynamically imported: its schema and fetch code load
   only when a shard is actually requested, so no page carries them in its
   fixed weight. */

/** The history is rebuilt by the daily pipeline; a shard is stable for hours. */
export const CLUB_DISTRICT_HISTORY_STALE_MS = 30 * 60 * 1000

export function clubDistrictHistoryShardQuery(shardKey: string) {
  return {
    queryKey: ['club-district-history-shard', shardKey] as const,
    queryFn: () =>
      import('../services/clubDistrictHistory').then(m =>
        m.fetchClubDistrictHistoryShard(shardKey)
      ),
    staleTime: CLUB_DISTRICT_HISTORY_STALE_MS,
    retry: false,
  }
}
