/**
 * Closing-Date Registry Freshness — Pure Functions (#1128, epic #1098)
 *
 * The committed registry (docs/month-end-closing-dates.json) maps each
 * Toastmasters data month to its last closing-period collection date. It is
 * the prerequisite for accurate historical rescrapes and (Sprint 2, #1129)
 * the rebuild's fail-closed closing remap — yet it sat 3 months stale with
 * nothing watching (audit 2026-06-09 §9b).
 *
 * These pure functions are the daily pipeline's drift guard: derive the
 * expected entries for COMPLETED closing months from raw-csv metadata and
 * compare against the committed registry. Loud when behind (L107), quiet
 * about what it cannot know (outage months have no metadata to derive from —
 * those entries are maintained manually and trusted).
 *
 * No GCS/network I/O lives here; the runner (scripts/closing-registry-check.ts)
 * supplies the fetched metadata window.
 */

import type { RawCSVEntry } from './monthEndDates.js'

/** One (dataMonth → closingDate) registry entry, e.g. 2026-05 → 2026-06-05. */
export interface RegistryMonthEntry {
  dataMonth: string
  closingDate: string
}

export interface RegistryMismatch {
  dataMonth: string
  registryClosingDate: string
  derivedClosingDate: string
}

export interface RegistryFreshnessResult {
  fresh: boolean
  /** Derivable completed months absent from the registry. */
  missing: RegistryMonthEntry[]
  /** Months where reality moved past the registered closing date. */
  mismatched: RegistryMismatch[]
  /** True when no metadata entries were supplied — a monitor-feed failure. */
  emptyFeed: boolean
  /** The derivable completed months that were actually verified. */
  checkedMonths: string[]
}

export function deriveCompletedClosingMonths(
  _entries: RawCSVEntry[]
): RegistryMonthEntry[] {
  throw new Error('not implemented')
}

export function evaluateRegistryFreshness(
  _registryMonths: RegistryMonthEntry[],
  _entries: RawCSVEntry[]
): RegistryFreshnessResult {
  throw new Error('not implemented')
}

export function buildRegistryStaleTitle(
  _result: RegistryFreshnessResult
): string {
  throw new Error('not implemented')
}

export function buildRegistryStaleBody(
  _result: RegistryFreshnessResult
): string {
  throw new Error('not implemented')
}
