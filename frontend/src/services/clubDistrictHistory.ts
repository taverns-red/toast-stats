/* Reader for the club-district history (#1782 → #1806).

   The history is sharded by the last two digits of the club id, so a reader
   fetches only the shard(s) holding the clubs it needs (~12 KB gz each) —
   never the whole ~0.9 MB-gz history. Nothing here runs at import time:
   callers fetch on demand (a transfer in the diff, a club-number search
   miss), so no page pays for it up front. */

import {
  ClubDistrictHistoryShardSchema,
  type ClubDistrictHistoryShard,
} from '@taverns-red/shared-contracts'
import { cdnClubDistrictHistoryShardUrl } from './cdn'
import { recordCdnResponse } from './cdnCacheTracker'

const SHARD_KEY = /^\d{2}$/

/** Fetch and validate one history shard. Throws on any failure — callers
    treat a failure as "history unknown" and keep today's behaviour. */
export async function fetchClubDistrictHistoryShard(
  shardKey: string
): Promise<ClubDistrictHistoryShard> {
  if (!SHARD_KEY.test(shardKey)) {
    throw new Error(`Invalid club-district history shard key: ${shardKey}`)
  }
  const url = cdnClubDistrictHistoryShardUrl(shardKey)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`CDN fetch failed: ${res.status} for ${url}`)
  recordCdnResponse(res)
  const parsed = ClubDistrictHistoryShardSchema.safeParse(await res.json())
  if (!parsed.success) {
    throw new Error(`Malformed club-district history shard ${shardKey}`)
  }
  return parsed.data
}
