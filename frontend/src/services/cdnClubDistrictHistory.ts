/**
 * Club-district history readers (#1817; artifact #1782, epic #1781).
 *
 * `config/club-district-history/index.json` names the shards; each shard
 * `NN.json` holds the clubs whose id ends in NN. The club is the key, so a
 * club that moved district keeps its history.
 *
 * Both readers resolve `null` — never throw — on a 404, a network error or a
 * contract failure. `null` means "not available"; a caller folding every
 * shard must treat one `null` as an unavailable history, never as fewer clubs.
 */

import {
  ClubDistrictHistoryIndexSchema,
  ClubDistrictHistoryShardSchema,
  type ClubDistrictHistoryIndex,
  type ClubDistrictHistoryShard,
} from '@taverns-red/shared-contracts'
import { recordCdnResponse } from './cdnCacheTracker'

const CDN_BASE_URL =
  import.meta.env['VITE_CDN_BASE_URL'] || 'https://cdn.taverns.red'

const PREFIX = 'config/club-district-history'

export function cdnClubDistrictHistoryIndexUrl(): string {
  return `${CDN_BASE_URL}/${PREFIX}/index.json`
}

export function cdnClubDistrictHistoryShardUrl(shard: string): string {
  return `${CDN_BASE_URL}/${PREFIX}/${shard}.json`
}

async function fetchParsed<T>(
  url: string,
  parse: (body: unknown) => T | null
): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    recordCdnResponse(res)
    return parse(await res.json())
  } catch {
    return null
  }
}

export function fetchClubDistrictHistoryIndex(): Promise<ClubDistrictHistoryIndex | null> {
  return fetchParsed(cdnClubDistrictHistoryIndexUrl(), body => {
    const parsed = ClubDistrictHistoryIndexSchema.safeParse(body)
    return parsed.success ? parsed.data : null
  })
}

export function fetchClubDistrictHistoryShard(
  shard: string
): Promise<ClubDistrictHistoryShard | null> {
  return fetchParsed(cdnClubDistrictHistoryShardUrl(shard), body => {
    const parsed = ClubDistrictHistoryShardSchema.safeParse(body)
    // A shard served under another key would mis-assign its clubs.
    return parsed.success && parsed.data.shard === shard ? parsed.data : null
  })
}
