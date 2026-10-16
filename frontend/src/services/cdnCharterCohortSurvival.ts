/**
 * Charter cohort survival reader (#2061; page #1817).
 *
 * `config/charter-cohort-survival/district_<id>.json` holds one district's
 * survival curves through every program year, folded by the pipeline from
 * the club-district history (a few KB, instead of all 100 shards).
 *
 * Resolves `null` — never throws — on a 404 (the file is not on prod yet),
 * a network error, a contract failure, or a file for another district. The
 * caller then folds the history shards itself.
 */

import {
  CharterCohortSurvivalFileSchema,
  charterCohortSurvivalObjectPath,
  type CharterCohortSurvivalFile,
} from '@taverns-red/shared-contracts'
import { recordCdnResponse } from './cdnCacheTracker'

const CDN_BASE_URL =
  import.meta.env['VITE_CDN_BASE_URL'] || 'https://cdn.taverns.red'

/** Throws on a district id that cannot name an object. */
export function cdnCharterCohortSurvivalUrl(districtId: string): string {
  return `${CDN_BASE_URL}/${charterCohortSurvivalObjectPath(districtId)}`
}

export async function fetchCharterCohortSurvival(
  districtId: string
): Promise<CharterCohortSurvivalFile | null> {
  try {
    const res = await fetch(cdnCharterCohortSurvivalUrl(districtId))
    if (!res.ok) return null
    recordCdnResponse(res)
    const parsed = CharterCohortSurvivalFileSchema.safeParse(await res.json())
    // A file served under another district would show its curves here.
    return parsed.success && parsed.data.districtId === districtId
      ? parsed.data
      : null
  } catch {
    return null
  }
}
