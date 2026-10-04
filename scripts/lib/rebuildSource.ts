/**
 * Rebuild source resolution for month-end dates (#1608) — pure functions.
 *
 * A rebuild is requested by SNAPSHOT date, but raw-csv/{month-end} is TI's
 * in-month view ("Month of Jun, As of 06/30"). The month's close is
 * collected weeks later under a next-month date flagged
 * `isClosingPeriod: true, dataMonth: YYYY-MM`, and the transform remaps it
 * onto the month-end. Rebuilding a month-end from its same-named raw
 * therefore replaces the close with pre-close data (2026-06-30, rebuilt
 * 2026-09-10). These functions pick the authoritative raw instead.
 */

import type { ClosingDateEntry } from '../../packages/collector-cli/src/utils/ClosingDateRegistry.js'
import { findLastClosingDate, type RawCSVEntry } from './monthEndDates.js'

/**
 * How far past a month-end a close can still be collected. Historical
 * year-end closes run to ~07-25; 2022-05 closed 06-17. 45 days covers every
 * registry entry with margin while keeping the GCS metadata read small.
 */
export const CLOSING_WINDOW_DAYS = 45

function parseUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`)
}

function formatUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** True when `date` (YYYY-MM-DD) is the last calendar day of its month. */
export function isLastDayOfMonth(date: string): boolean {
  const next = parseUtc(date)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.getUTCDate() === 1
}

/**
 * Raw-csv dates that could hold the close for the month ending on
 * `monthEnd`: strictly after it, within CLOSING_WINDOW_DAYS.
 */
export function closingCandidateWindow(
  monthEnd: string,
  rawDates: string[]
): string[] {
  const end = parseUtc(monthEnd)
  end.setUTCDate(end.getUTCDate() + CLOSING_WINDOW_DAYS)
  const last = formatUtc(end)
  return rawDates.filter(d => d > monthEnd && d <= last).sort()
}

/**
 * The raw-csv date a rebuild of `requestedDate` should transform.
 *
 * - Month-end with a metadata-proven closing raw for its data month → the
 *   LAST such raw (the transform remaps it back onto the month-end with
 *   isClosingPeriodData/collectionDate provenance).
 * - Otherwise, month-end whose registry closing date has a raw dir → that
 *   raw. Pre-2026 raws carry no metadata.json; the transform decides them
 *   from the CSV footer, and the committed registry names them here.
 *   Metadata wins over the registry: it is direct evidence, the registry
 *   is curated (and lists 2026-06 → 07-29, a July daily).
 * - Month-end with neither → the requested date (nothing better exists).
 * - Any other date → the requested date (closing raws remap themselves).
 */
export function resolveRebuildSourceDate(
  requestedDate: string,
  entries: RawCSVEntry[],
  fallback: { registry?: ClosingDateEntry[]; rawDates?: string[] } = {}
): string {
  if (!isLastDayOfMonth(requestedDate)) return requestedDate
  const dataMonth = requestedDate.slice(0, 7)

  const proven = findLastClosingDate(entries, dataMonth)
  if (proven !== null) return proven

  const registered = fallback.registry?.find(
    e => e.dataMonth === dataMonth
  )?.closingDate
  if (registered !== undefined && fallback.rawDates?.includes(registered)) {
    return registered
  }
  return requestedDate
}
