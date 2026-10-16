/* The one TanStack Query definition for a club-district history shard
   (#1782), shared by every reader: the club page and survival page (#2059),
   the Changes-feed transfers and the omni-search closed-club fallback
   (#2060). One key per shard, so they all hit one cache entry (#2073).

   The reader (`cdnClubDistrictHistory`, #1817) resolves `null` rather than
   throwing on any failure. It is dynamically imported: its schema and fetch
   code load only when a shard is actually requested, so no page (the app
   shell's omni-search included) carries them in its fixed weight. */

/** The history is rebuilt by the daily pipeline; a shard is stable for a while. */
export const CLUB_DISTRICT_HISTORY_STALE_MS = 15 * 60 * 1000

type Reader = typeof import('../services/cdnClubDistrictHistory')
let reader: Promise<Reader> | undefined

/** One import for every shard: the survival page asks for all 100 at once.
    A failed chunk load is not cached, so the next query can retry it. */
const loadReader = (): Promise<Reader> =>
  (reader ??= import('../services/cdnClubDistrictHistory').catch(e => {
    reader = undefined
    throw e
  }))

export function clubDistrictHistoryShardQuery(shardKey: string) {
  return {
    queryKey: ['club-district-history', 'shard', shardKey] as const,
    queryFn: () =>
      loadReader().then(m => m.fetchClubDistrictHistoryShard(shardKey)),
    staleTime: CLUB_DISTRICT_HISTORY_STALE_MS,
  }
}
