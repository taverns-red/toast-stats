import type { ProgramYear } from './programYear'
import { computeFreshness } from './dataFreshness'
import { formatDisplayDate } from './dateFormatting'

/* Non-component helpers for the phone context bar + bottom sheet (#1831),
   kept out of the component files so they stay fast-refresh clean. */

/** "PY 26–27" — the compact two-digit form the context bar has room for. */
export const formatPyCompact = (py: ProgramYear): string =>
  `PY ${String(py.year).slice(-2)}–${String(py.year + 1).slice(-2)}`

/** A phone on its side (812×375 etc., #1847): same query as the CSS that
 * gives short landscape the phone chrome (context-bar.css, safe-area.css). */
export const SHORT_LANDSCAPE_QUERY =
  '(orientation: landscape) and (max-height: 500px)'

/** Downward drag on the bottom sheet's handle, in px, that dismisses it. */
export const SWIPE_CLOSE_PX = 60

/** The sheet's freshness line ("Data fresh · Oct 10, 2026"), from the same
 * computeFreshness rule the desktop pill uses (#1310) — one source of truth. */
export function formatFreshnessLine(params: {
  asOfDate: string | undefined
  snapshotDate: string | undefined
  isLatest: boolean
}): string | undefined {
  const f = computeFreshness(params)
  if (!f.displayDate) return undefined
  return f.reconcilingMonthLabel
    ? `As of ${formatDisplayDate(f.displayDate)} · ${f.reconcilingMonthLabel} month-end reconciliation`
    : `Data fresh · ${formatDisplayDate(f.displayDate)}`
}
