/**
 * The district set belongs to the date being written (#1465).
 *
 * A snapshot directory must contain only districts that existed on its OWN
 * date. `snapshots/2026-06-30/` broke that rule: a rewrite on 2026-07-31 was
 * handed the then-current discovery set (the 94 districts of PY 2026-27,
 * including the renumbered 201-231) and applied it to a closed program year
 * whose own districtsummary listed 128 districts. Because the per-district
 * export endpoint ignores the program-year token (#1342), every one of those
 * fetches SUCCEEDED and returned current-year data — so nothing failed loudly
 * and 4,673 clubs ended up filed under two districts on one date.
 *
 * The fix needs no new fetch and no second program-year computation: the
 * resolver (#1284) already downloads and validates that date's districtsummary
 * CSV, and its DISTRICT column IS the authoritative district set for the date.
 * This module is the pure rule that reconciles a requested list against it.
 *
 * `calculateProgramYear` stays calendar-pure and the active program year is
 * still resolved exactly once per run — this reads the content that resolution
 * already produced.
 */

import { parseDistrictIdsFromSummaryCsv } from './programYearResolver.js'

export interface DistrictSetReconciliation {
  /** The requested districts that existed on the date, in the caller's order. */
  districts: string[]
  /** Requested districts absent from the date's districtsummary. */
  skipped: string[]
  /**
   * False when the summary could not be read as a district list — the outcome
   * is then UNDECIDED, never a verdict (#1129): the caller's list passes
   * through untouched rather than being emptied by an unparseable page.
   */
  applied: boolean
}

/**
 * Canonical comparison key for a district id.
 *
 * The config, the CLI `--districts` list and the CSV disagree on zero-padding
 * (`01` vs `1`) and on case (`F` vs `f`); none of those differences names a
 * different district.
 */
function canonicalDistrictKey(districtId: string): string {
  const trimmed = districtId.trim().toUpperCase()
  return /^\d+$/.test(trimmed) ? String(parseInt(trimmed, 10)) : trimmed
}

/**
 * Reconcile a requested district list against the districtsummary CSV for the
 * date being written.
 *
 * @param requested       District ids the run was asked to scrape.
 * @param summaryContent  The validated districtsummary body for that date, as
 *                        returned by `resolveActiveProgramYear`.
 */
export function reconcileDistrictsForDate(
  requested: readonly string[],
  summaryContent: string | undefined | null
): DistrictSetReconciliation {
  const existing = parseDistrictIdsFromSummaryCsv(summaryContent)
  if (existing.length === 0) {
    throw new Error(
      `reconcileDistrictsForDate is not implemented yet (#1465): ` +
        `${requested.length} requested, ${existing.length} in the summary`
    )
  }
  throw new Error('reconcileDistrictsForDate is not implemented yet (#1465)')
}

export { canonicalDistrictKey }
