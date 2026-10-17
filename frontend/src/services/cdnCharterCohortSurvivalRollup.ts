/**
 * Region and world charter cohort survival reader (#1818).
 *
 * `config/charter-cohort-survival/region_<NN>.json` and `.../world.json`
 * hold the curves through every program year, folded by the pipeline from
 * the club-district history with each year's own region membership (a few
 * KB each).
 *
 * Resolves `null` on a 404 (the file is not on prod yet), a contract
 * failure or a file for another scope: the page says the survival is not
 * available yet. Rejects on a network or server error, so the page says it
 * could not load rather than "not yet". There is no shard fallback here:
 * a region or the world would need the whole club history in the browser.
 */

import {
  CharterCohortSurvivalRollupFileSchema,
  charterCohortSurvivalRollupObjectPath,
  type CharterCohortSurvivalRollupFile,
  type CharterCohortSurvivalScope,
} from '@taverns-red/shared-contracts'
import { recordCdnResponse } from './cdnCacheTracker'

const CDN_BASE_URL =
  import.meta.env['VITE_CDN_BASE_URL'] || 'https://cdn.taverns.red'

/** Throws on a region id that cannot name an object. */
export function cdnCharterCohortSurvivalRollupUrl(
  scope: CharterCohortSurvivalScope
): string {
  return `${CDN_BASE_URL}/${charterCohortSurvivalRollupObjectPath(scope)}`
}

const sameScope = (
  a: CharterCohortSurvivalScope,
  b: CharterCohortSurvivalScope
): boolean =>
  a.kind === 'world'
    ? b.kind === 'world'
    : b.kind === 'region' && a.regionId === b.regionId

export async function fetchCharterCohortSurvivalRollup(
  scope: CharterCohortSurvivalScope
): Promise<CharterCohortSurvivalRollupFile | null> {
  const res = await fetch(cdnCharterCohortSurvivalRollupUrl(scope))
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`charter cohort survival: HTTP ${res.status}`)
  }
  recordCdnResponse(res)
  const parsed = CharterCohortSurvivalRollupFileSchema.safeParse(
    await res.json()
  )
  // A file served under another scope would show its curves here.
  return parsed.success && sameScope(parsed.data.scope, scope)
    ? parsed.data
    : null
}
