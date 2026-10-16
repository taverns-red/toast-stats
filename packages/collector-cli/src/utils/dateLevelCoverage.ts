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

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
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

/**
 * The districts a snapshot date's `metadata.json` records as failed — a
 * #1671 source gap included (#2035). Transform writes that file only once
 * every district of the date is accounted for, and lists a district there
 * only when this run recorded its failure or gap with a reason in
 * `errors[]`. A downstream roster check accepts these exactly as transform's
 * does; any other district without input is still a shortfall. An absent or
 * unreadable metadata file records nothing, so the check stays closed.
 */
export async function recordedFailedDistricts(
  snapshotDir: string
): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse(
      await fs.readFile(path.join(snapshotDir, 'metadata.json'), 'utf-8')
    )
    const failed =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { failedDistricts?: unknown }).failedDistricts
        : undefined
    return Array.isArray(failed)
      ? failed.filter((id): id is string => typeof id === 'string')
      : []
  } catch {
    return []
  }
}

/**
 * Why each district {@link recordedFailedDistricts} names has no file, read
 * from the same `metadata.json`'s `errors[]` — transform writes one
 * `"<districtId>: <reason>"` entry per recorded failure or #1671 gap. Keyed
 * by the district id as `failedDistricts` spells it; a district with no
 * matching entry is left out, and the caller states it without a reason
 * rather than inventing one (#2042).
 */
export async function recordedFailureReasons(
  snapshotDir: string
): Promise<Record<string, string>> {
  const failed = await recordedFailedDistricts(snapshotDir)
  let errors: unknown
  try {
    const parsed: unknown = JSON.parse(
      await fs.readFile(path.join(snapshotDir, 'metadata.json'), 'utf-8')
    )
    errors =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { errors?: unknown }).errors
        : undefined
  } catch {
    return {}
  }
  if (!Array.isArray(errors)) return {}
  const reasons: Record<string, string> = {}
  for (const districtId of failed) {
    const prefix = `${districtId}: `
    const entry = errors.find(
      (e): e is string => typeof e === 'string' && e.startsWith(prefix)
    )
    if (entry) reasons[districtId] = entry.slice(prefix.length)
  }
  return reasons
}

/**
 * The districts a snapshot date's `metadata.json` records as a #1671 source
 * gap: listed in `failedDistricts`, not in `successfulDistricts`, with an
 * `errors[]` entry `"<id>: Skipped: …"`. TransformService gives no other
 * failure that prefix (#2035); the same rule as `scripts/lib/sourceGap.ts`
 * (#2038). A failure without a gap reason is not a gap: its district may have
 * been measured by an earlier run, and that point must stand (#2070).
 */
export async function recordedSourceGapDistricts(
  snapshotDir: string
): Promise<string[]> {
  let parsed: unknown
  try {
    parsed = JSON.parse(
      await fs.readFile(path.join(snapshotDir, 'metadata.json'), 'utf-8')
    )
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []
  const record = parsed as Record<string, unknown>
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []
  const successful = new Set(strings(record['successfulDistricts']))
  const errors = strings(record['errors'])
  return [...new Set(strings(record['failedDistricts']))].filter(
    id =>
      !successful.has(id) && errors.some(e => e.startsWith(`${id}: Skipped: `))
  )
}
