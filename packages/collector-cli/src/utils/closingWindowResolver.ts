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

/**
 * Thrown when no authority (metadata.json, CSV footer, registry) can decide
 * whether a collection date falls in a closing period. Callers must treat
 * this as "refuse to publish under the raw date" (#1129).
 */
export class ClosingPeriodUndecidedError extends Error {
  constructor(date: string, reason: string) {
    super(
      `Cannot decide closing-period status for ${date}: ${reason}. ` +
        'Failing closed — refusing to publish under the raw date (#1129). ' +
        'Add the missing month to docs/month-end-closing-dates.json or ' +
        'restore the raw-csv metadata.json to unblock this date.'
    )
    this.name = 'ClosingPeriodUndecidedError'
  }
}

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
  if (!DATE_RE.test(requestedDate)) {
    return {
      kind: 'unknown',
      reason: `invalid requested date '${requestedDate}' (expected YYYY-MM-DD)`,
    }
  }

  const year = Number(requestedDate.slice(0, 4))
  const month = Number(requestedDate.slice(5, 7))
  if (month < 1 || month > 12) {
    return {
      kind: 'unknown',
      reason: `invalid month in requested date '${requestedDate}'`,
    }
  }

  // A date in month M can only fall inside month M-1's closing window.
  const prevYear = month === 1 ? year - 1 : year
  const prevMonth = month === 1 ? 12 : month - 1
  const prevDataMonth = `${prevYear}-${String(prevMonth).padStart(2, '0')}`

  const entry = months.find(m => m.dataMonth === prevDataMonth)
  if (!entry) {
    return {
      kind: 'unknown',
      reason: `registry has no entry for data month ${prevDataMonth}`,
    }
  }

  if (!DATE_RE.test(entry.closingDate)) {
    return {
      kind: 'unknown',
      reason: `registry entry for ${prevDataMonth} has malformed closingDate '${entry.closingDate}'`,
    }
  }

  // ISO date strings compare correctly as strings. Inclusive boundary: the
  // registry's closingDate is the LAST closing-period collection date.
  if (requestedDate <= entry.closingDate) {
    const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate()
    return {
      kind: 'closing',
      dataMonth: prevDataMonth,
      snapshotDate: `${prevDataMonth}-${String(lastDay).padStart(2, '0')}`,
    }
  }

  return { kind: 'non-closing' }
}
