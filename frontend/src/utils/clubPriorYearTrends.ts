import type { PriorYearTrend } from '../components/membershipTrendChartData'
import type { ClubHistoryRow } from './clubHistory'

/**
 * #1791 — a club's completed program years as faint context lines for its
 * membership trend, in #1705's `PriorYearTrend` shape.
 *
 * The source is the club's year-end history rows (`useClubHistory`), one
 * settled snapshot per completed PY, so each year has two points: its base
 * on July 1 and its close at the row's own year-end snapshot date (always
 * inside that PY, Lesson: year-end source dates). Nothing is interpolated.
 *
 * Only years before the page's program year are returned (R3: the page's
 * selector decides "current", never the data). Rows without data are
 * dropped, newest first is kept.
 */
export function clubPriorYearTrends(
  rows: readonly ClubHistoryRow[],
  currentProgramYear: string
): PriorYearTrend[] {
  const m = /^(\d{4})-\d{4}$/.exec(currentProgramYear)
  if (!m) return []
  const currentStart = Number(m[1])

  return rows
    .filter(r => r.hasData && r.startYear < currentStart)
    .map(r => ({
      label: `${r.startYear}-${r.startYear + 1}`,
      data: [
        ...(r.membershipBase !== null
          ? [{ date: `${r.startYear}-07-01`, count: r.membershipBase }]
          : []),
        ...(r.membershipEnd !== null
          ? [{ date: r.yearEndDate, count: r.membershipEnd }]
          : []),
      ],
    }))
    .filter(t => t.data.length > 0)
}
