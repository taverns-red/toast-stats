import { formatSignedNet } from '../components/ClubTrendSparkline'

/* districtTrendSeries (#1815) — the membership series behind the region
   districts table's sparkline column (the district counterpart of the
   Clubs-table sparkline, #1792). Read from the district's program-year
   time-series file; bounded by the page's pinned snapshot date (R3) so a
   past date never shows points collected after it. */

export interface TrendPoint {
  date: string
  membership: number
}

export function districtTrendSeries(
  points: readonly TrendPoint[],
  snapshotDate: string | undefined
): number[] {
  return [...points]
    .filter(p => snapshotDate === undefined || p.date <= snapshotDate)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map(p => p.membership)
}

/** Accessible name: first → last and the signed net (Lesson 102). */
export function describeDistrictTrend(series: readonly number[]): string {
  if (series.length === 0) return 'No membership trend for this date'
  const first = series[0]!
  const last = series[series.length - 1]!
  return `Membership ${first.toLocaleString('en-US')} → ${last.toLocaleString(
    'en-US'
  )} this program year, net ${formatSignedNet(last - first)}`
}
