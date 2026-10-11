/**
 * Date-level artifacts need the date's whole district set (#1756, ADR-015 P3).
 *
 * `all-districts-rankings.json`, snapshot `metadata.json`/`manifest.json`,
 * `competitive-awards.json`, `global-totals.json`, `global-club-race.json` and
 * raw-csv `metadata.json` each describe EVERY district of a date. A run that
 * holds per-district input for only some of them (a `districts=` subset that
 * was not hydrated from staging) must not write them: a missing input would
 * be published as a measured zero, or a one-district count as the world's.
 *
 * The district set is the date's own all-districts CSV (the districtsummary),
 * never the run's requested list. This module is the pure comparison; each
 * writer supplies what it found on disk and refuses on a shortfall with a
 * counted error under {@link DATE_LEVEL_ERROR_ID}.
 */

import { canonicalDistrictKey } from './districtSetForDate.js'

/** The `districtId` a date-level refusal is recorded under in `errors[]`. */
export const DATE_LEVEL_ERROR_ID = 'date-level'

/**
 * The districts in `expected` with no counterpart in `present`, compared on
 * the canonical key (`02` ≡ `2`, `f` ≡ `F`), in `expected`'s order.
 */
export function missingDistricts(
  expected: readonly string[],
  present: Iterable<string>
): string[] {
  const have = new Set([...present].map(canonicalDistrictKey))
  return expected.filter(id => !have.has(canonicalDistrictKey(id)))
}

/** One message shape for every refusing writer, so logs grep alike. */
export function dateLevelRefusal(
  artifacts: string,
  date: string,
  expectedCount: number,
  missing: readonly string[]
): string {
  return (
    `Refused ${artifacts} for ${date}: ${missing.length} of ${expectedCount} ` +
    `districts in the date's district set have no per-district input ` +
    `(missing: ${missing.join(', ')}). Hydrate them from staging or run ` +
    `without a districts subset (#1756).`
  )
}
