/**
 * Worldwide rollup — count every club exactly once (#1466, epic #1426).
 *
 * Every artifact this project publishes today is per-district. The CEO Report
 * is global with five years of history, so the rollup IS the build (#1426) —
 * and a rollup that sums a snapshot directory's district files, trusting the
 * directory's own district list, is wrong on at least one real date.
 *
 * `snapshots/2026-06-30/` holds the 128 districts that existed at the 2025-26
 * close PLUS 30 renumbered PY 2026-27 districts a rewrite stamped onto it
 * (#1465). **4,673 clubs appear under two districts there.** A naive sum
 * inflates clubs +31.1%, membership +32.5%, payments +5.0% — and it would not
 * have failed loudly. It would have published a plausible global number that
 * is wrong: the silent-failure shape of #1436-#1443.
 *
 * Two rules, in this order:
 *
 * 1. **Scope to the date's own district set** — the ids
 *    `all-districts-rankings.json` lists for that date, never `readdir()` of
 *    whatever files happen to sit in the directory. This is the rule that
 *    reproduces TI's published figure exactly.
 * 2. **Key on the canonical club id** (`normalizeClubId`, #1440/#1447) inside
 *    that scope, so a club that somehow appears twice is counted once and is
 *    REPORTED. Deduplication alone cannot stand in for rule 1: which of two
 *    rows for one club wins is an artifact of file order, not of truth, so it
 *    can produce a number that is merely different rather than correct. Its
 *    job here is to make contamination visible.
 *
 * A rollup with no district scope is refused outright rather than allowed to
 * emit a plausible number (R17 — the case is stated, not implied).
 *
 * Purity: every computation exported here is pure. `readSnapshotRollupInput`
 * at the bottom is the only function that touches the filesystem.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  districtIdFromSnapshotFileName,
  isDistrictSnapshotFile,
  normalizeClubId,
} from '@taverns-red/shared-contracts'

/** One club's payment row, as read from a district snapshot. */
export interface ClubPaymentRow {
  /** The club id VERBATIM — normalization happens here, not at the caller. */
  readonly clubId: string
  /** Membership payments to date for the snapshot's program year. */
  readonly payments: number
}

/** One district file's contribution to the rollup. */
export interface DistrictClubPayments {
  readonly districtId: string
  readonly clubs: readonly ClubPaymentRow[]
}

export interface GlobalRollupInput {
  /** Every district file found in the snapshot directory. */
  readonly districts: readonly DistrictClubPayments[]
  /**
   * The district ids the date's `all-districts-rankings.json` lists — the
   * authoritative district set for that date.
   */
  readonly rankingsDistrictIds: readonly string[]
}

/** A club id that resolved to a district outside the date's district set. */
export interface DuplicateClub {
  /** Canonical club id (`normalizeClubId`). */
  readonly clubId: string
  /** Every district the id was seen in, in input order. */
  readonly districtIds: readonly string[]
}

export interface GlobalRollup {
  /** Districts counted — those in scope that had a file. */
  readonly districtCount: number
  /** Distinct canonical club ids counted. */
  readonly clubCount: number
  /** Payments summed over the counted clubs. */
  readonly totalPayments: number
  /** District files present in the directory but not in the date's set. */
  readonly excludedDistricts: readonly string[]
  /** Districts the date's set lists but no file supplied. */
  readonly missingDistricts: readonly string[]
  /**
   * Clubs that appeared under more than one district within scope. Counted
   * once; reported loudly, because a non-empty list means the directory is
   * contaminated even after scoping.
   */
  readonly duplicateClubs: readonly DuplicateClub[]
}

/**
 * Canonical comparison key for a district id — the config, the CSV and the
 * rankings file disagree on zero-padding and case, and neither difference
 * names a different district.
 */
export function canonicalDistrictId(districtId: string): string {
  const trimmed = districtId.trim().toUpperCase()
  return /^\d+$/.test(trimmed) ? String(parseInt(trimmed, 10)) : trimmed
}

export function rollUpGlobal(input: GlobalRollupInput): GlobalRollup {
  throw new Error(
    `rollUpGlobal is not implemented yet (#1466): ` +
      `${input.districts.length} district files, ` +
      `${input.rankingsDistrictIds.length} districts in scope`
  )
}

/**
 * Read one snapshot directory into rollup input: every `district_*.json` file
 * it holds, plus the district set `all-districts-rankings.json` lists for that
 * date. The two are read SEPARATELY on purpose — the whole point is that the
 * directory listing is not the district set.
 */
export function readSnapshotRollupInput(
  snapshotDir: string
): GlobalRollupInput {
  throw new Error(
    `readSnapshotRollupInput is not implemented yet (#1466): ${snapshotDir}`
  )
}

/** Re-exported so callers use one canonical rule, not a fourth copy. */
export { normalizeClubId }
