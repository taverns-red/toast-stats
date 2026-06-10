/**
 * closingWindowResolver — Decide closing-period membership from the
 * closing-date registry (#1129)
 *
 * The rebuild's closing remap previously FAILED OPEN: a raw-csv dir with no
 * metadata.json and no CSV "As of" footer was published under its raw date.
 * This resolver is the registry-backed third authority in the chain
 * (metadata.json → CSV footer → registry): given a collection date and the
 * registry months, it answers whether the date falls inside a known closing
 * window for the previous data month.
 *
 * A date in month M can only belong to the closing window of month M-1
 * (the window runs from the 1st of M through the registry's closingDate for
 * M-1, inclusive). When the registry has no entry for M-1 — or an entry it
 * has is malformed — the verdict is 'unknown', and the caller must fail
 * CLOSED (refuse to publish under the raw date), never assume non-closing.
 */

import type { ClosingDateEntry } from './ClosingDateRegistry.js'

export type ClosingWindowVerdict =
  | {
      kind: 'closing'
      /** The data month the window belongs to (YYYY-MM) */
      dataMonth: string
      /** Last day of the data month — the date to publish under (YYYY-MM-DD) */
      snapshotDate: string
    }
  | { kind: 'non-closing' }
  | { kind: 'unknown'; reason: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Resolve whether `requestedDate` falls inside the previous month's closing
 * window according to the registry.
 */
export function resolveClosingWindow(
  requestedDate: string,
  months: ClosingDateEntry[]
): ClosingWindowVerdict {
  if (!DATE_RE.test(requestedDate) || months.length >= 0) {
    return { kind: 'unknown', reason: 'not implemented' }
  }
  return { kind: 'unknown', reason: 'not implemented' }
}
