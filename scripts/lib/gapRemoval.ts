/**
 * Gap-district removal — the plan (#2232). Pure; no I/O.
 *
 * When a district's club report is a #1671 gap (TI's HTML error page as
 * the CSV), the transform writes no `district_<id>.json` and compute no
 * analytics for it, and `metadata.json` records it (sourceGap.ts). Uploads
 * and promotion only add, so the district's objects from an earlier build
 * survived on the date: a 0-member analytics file next to metadata that
 * says the district failed.
 *
 * This decides, for one bucket and one date, which of those objects go.
 * The rebuild's staging step (scripts/plan-gap-removals.ts, called from
 * process-dates.sh) and scoped promotion's prod step both use it, and both
 * derive it from bucket state every time — never from a record of an
 * earlier step — so a held date, a failed copy, a re-run, or a
 * skip_promotion proof followed by a promote all converge.
 *
 * Removed, and nothing else:
 * - only districts the date's metadata.json records as a #1671 source gap
 *   (failed with an `<id>: Skipped: ` reason, not also successful) — never
 *   another failure, which can be transient;
 * - only what transform + compute write: `district_<id>.json` and
 *   `analytics/district_<id>_<kind>.json`. Never the reports sidecar
 *   (`district_<id>_reports.json`): a separate TI dataset the rebuild
 *   cannot regenerate, untouched by a club-report gap;
 * - only while that bucket's own `district_<id>.json` is the 0-club junk.
 *   Real clubs, an unreadable file, or no file keep everything, so no
 *   gate override (allow_value_changes) can turn this into deleting data;
 * - never an object the caller must keep (what the run wrote; for prod,
 *   what staging still holds — a district file staging keeps keeps the
 *   district whole in prod);
 * - analytics first, the district files last, so a run that fails part
 *   way can still prove the district is junk on a re-run.
 */

import { sourceGapDistricts } from './sourceGap.js'

/** A date recording more gaps than this is refused, not cleaned. */
export const MAX_GAP_DISTRICTS_PER_DATE = 5

const ID = /^[A-Za-z0-9]+$/

/** True for the transform/compute objects of district `id` (relative names). */
export function isGapRemovable(name: string, id: string): boolean {
  if (!ID.test(id)) return false
  return (
    name === `district_${id}.json` ||
    new RegExp(`^analytics/district_${id}_[a-z-]+\\.json$`).test(name)
  )
}

export interface GapRemovalInput {
  /** The date's metadata.json (staging's: the run's own record); null = unreadable. */
  metadata: unknown
  /** Object names in the target bucket, relative to `snapshots/<date>/`. */
  names: readonly string[]
  /**
   * The target bucket's `district_<id>.json` club count per gap id: a
   * number, null when unreadable or not a district snapshot, absent when
   * the caller did not read it (the file is absent).
   */
  districtClubs: Readonly<Record<string, number | null>>
  /** Names that must not be removed. */
  keep: ReadonlySet<string>
}

export interface GapRemovalPlan {
  /** The date's recorded gap districts. */
  gaps: string[]
  /** Names to remove, in order: analytics first, district files last. */
  remove: string[]
  /** Removable-shaped names left in place, with why. */
  kept: Array<{ path: string; reason: string }>
  /** Set when the whole date is refused. */
  refused: string | null
}

export function planGapRemovals(input: GapRemovalInput): GapRemovalPlan {
  const gaps = sourceGapDistricts(input.metadata).filter(id => ID.test(id))
  const plan: GapRemovalPlan = { gaps, remove: [], kept: [], refused: null }
  if (gaps.length === 0) return plan
  const sorted = [...input.names].sort()
  if (gaps.length > MAX_GAP_DISTRICTS_PER_DATE) {
    plan.refused = `metadata.json records ${gaps.length} source gaps (more than ${MAX_GAP_DISTRICTS_PER_DATE}); refusing the date`
    for (const id of gaps) {
      for (const n of sorted.filter(n => isGapRemovable(n, id))) {
        plan.kept.push({ path: n, reason: plan.refused })
      }
    }
    return plan
  }
  const analytics: string[] = []
  const districtFiles: string[] = []
  for (const id of [...gaps].sort()) {
    const own = sorted.filter(n => isGapRemovable(n, id))
    if (own.length === 0) continue
    const file = `district_${id}.json`
    const keepAll = (reason: string) =>
      own.forEach(n => plan.kept.push({ path: n, reason }))
    if (input.keep.has(file)) {
      keepAll(`${file} is still held where it must be kept`)
      continue
    }
    if (!own.includes(file)) {
      keepAll(`${file} is absent, so nothing proves the district is junk`)
      continue
    }
    const clubs = input.districtClubs[id]
    if (clubs !== 0) {
      keepAll(
        typeof clubs === 'number'
          ? `${file} has ${clubs} club(s): not the 0-club junk of a #1671 gap`
          : `${file} is unreadable or not a district snapshot`
      )
      continue
    }
    for (const n of own) {
      if (input.keep.has(n)) {
        plan.kept.push({ path: n, reason: 'must be kept' })
      } else if (n === file) {
        districtFiles.push(n)
      } else {
        analytics.push(n)
      }
    }
  }
  plan.remove = [...analytics.sort(), ...districtFiles.sort()]
  return plan
}

/** `data.clubs` length of a district snapshot, null when it is not one. */
export function districtClubCount(value: unknown): number | null {
  const data = (value as { data?: { clubs?: unknown } } | null)?.data
  return data && Array.isArray(data.clubs) ? data.clubs.length : null
}
