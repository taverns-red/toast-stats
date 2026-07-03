import { formatDisplayDate } from './dateFormatting'

/**
 * Freshness state for the data pill (#1296).
 *
 * During month-end closing the snapshot DATE is pinned to the month-end (e.g.
 * 2026-06-30) while the dashboard "as of" date (`metadata.sourceCsvDate`)
 * advances into the next month (e.g. 2026-07-02) as figures reconcile. The pill
 * should show the real as-of date and signal that reconciliation is ongoing.
 */
export interface FreshnessState {
  /** Date to display in the pill — the "as of" (sourceCsvDate) when known. */
  displayDate: string | undefined
  /** True when the latest month-end is still reconciling into a later month. */
  reconciling: boolean
  /** e.g. "June 2026" — the month being reconciled (only when reconciling). */
  reconcilingMonthLabel?: string
}

/** YYYY-MM month key from an ISO date (date-only or datetime). */
function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
}

/**
 * Derive the freshness display date + reconciliation state.
 *
 * Reconciliation is flagged only when **all** hold, so a finalized historical
 * month-end selected via the date picker is never mislabelled:
 *   - we're viewing the latest snapshot (`isLatest`), and
 *   - the as-of date has advanced past the pinned snapshot date, into a
 *     different (later) month.
 */
export function computeFreshness(params: {
  /** metadata.sourceCsvDate — the dashboard "as of" date. */
  asOfDate: string | undefined
  /** The pinned snapshot date currently being viewed. */
  snapshotDate: string | undefined
  /** True when viewing the most recent available snapshot. */
  isLatest: boolean
}): FreshnessState {
  const { asOfDate, snapshotDate, isLatest } = params
  const displayDate = asOfDate ?? snapshotDate

  const reconciling =
    isLatest &&
    !!asOfDate &&
    !!snapshotDate &&
    asOfDate > snapshotDate &&
    monthKey(asOfDate) !== monthKey(snapshotDate)

  if (reconciling && snapshotDate) {
    return {
      displayDate,
      reconciling: true,
      reconcilingMonthLabel: formatDisplayDate(snapshotDate, {
        month: 'long',
        year: 'numeric',
      }),
    }
  }
  return { displayDate, reconciling: false }
}
