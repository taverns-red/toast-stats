/**
 * Closed-club name index reader (#2062).
 *
 * `config/closed-club-names.json` lists every club the club-district history
 * (#1782) has as closed, by name, so omni-search can find one that
 * `club-index.json` (the current roster) no longer carries. ~190 KB gzip,
 * fetched only after a search misses.
 *
 * Resolves `null` — never throws — on a 404 (the index reaches prod with
 * the next pipeline run), a network error or a contract failure: search
 * then carries on without closed names.
 */

import {
  ClosedClubNameIndexSchema,
  type ClosedClubNameIndex,
} from '@taverns-red/shared-contracts'
import { recordCdnResponse } from './cdnCacheTracker'

const CDN_BASE_URL =
  import.meta.env['VITE_CDN_BASE_URL'] || 'https://cdn.taverns.red'

export function cdnClosedClubNamesUrl(): string {
  return `${CDN_BASE_URL}/config/closed-club-names.json`
}

export async function fetchClosedClubNames(): Promise<ClosedClubNameIndex | null> {
  try {
    const res = await fetch(cdnClosedClubNamesUrl())
    if (!res.ok) return null
    recordCdnResponse(res)
    const parsed = ClosedClubNameIndexSchema.safeParse(await res.json())
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
