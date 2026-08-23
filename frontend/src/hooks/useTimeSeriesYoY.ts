/**
 * Compute Year-over-Year comparison from time-series data (#170).
 *
 * Compares the latest data point of the current program year to the
 * closest-month data point of the prior program year. Returns percentage
 * changes for membership, distinguished clubs, and club health.
 */

import type {
  ProgramYearIndexFile,
  TimeSeriesDataPoint,
  ReformationDiscontinuity,
} from '@taverns-red/shared-contracts'
import { detectReformationDiscontinuity } from '@taverns-red/shared-contracts'
import type { TimeSeriesData } from './useTimeSeries'

/**
 * YoY data shape expected by YearOverYearComparison component.
 */
export interface YearOverYearData {
  membershipChange: number
  distinguishedChange: number
  clubHealthChange: number
}

/**
 * Find the data point in `priorYear` closest to the same day-of-year
 * as `currentDate`. Uses month+day proximity (±7 days tolerance).
 */
function findClosestPriorYearPoint(
  priorYear: ProgramYearIndexFile,
  currentDate: string
) {
  if (priorYear.dataPoints.length === 0) return null

  // Extract month-day from current date (e.g. "2026-03-24" → "03-24")
  const currentMonthDay = currentDate.slice(5) // "MM-DD"

  let closestPoint = priorYear.dataPoints[0]!
  let closestDistance = Infinity

  for (const dp of priorYear.dataPoints) {
    const dpMonthDay = dp.date.slice(5)
    // Simple day-of-year distance (ignoring year boundary edge cases)
    const distance = Math.abs(
      monthDayToOrdinal(dpMonthDay) - monthDayToOrdinal(currentMonthDay)
    )
    if (distance < closestDistance) {
      closestDistance = distance
      closestPoint = dp
    }
  }

  // Only match if within 30 days (generous tolerance for sparse data)
  return closestDistance <= 30 ? closestPoint : null
}

/**
 * Convert "MM-DD" to an ordinal day estimate for distance comparison.
 */
function monthDayToOrdinal(monthDay: string): number {
  const [mm, dd] = monthDay.split('-').map(Number)
  return (mm ?? 0) * 31 + (dd ?? 0)
}

/**
 * Compute percentage change, handling zero division.
 */
function percentChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

/**
 * The two points every year-over-year figure on this page is derived from:
 * the latest point of the current program year, and the closest-day point of
 * the most recent prior program year.
 *
 * Extracted so the membership comparison, the payment comparison and the
 * #1442 reformation check all reason about the SAME pair. A discontinuity
 * detected against a different pair than the one being divided is worthless.
 */
interface YearOverYearPair {
  currentLatest: TimeSeriesDataPoint
  priorPoint: TimeSeriesDataPoint
}

function resolveYearOverYearPair(
  timeSeries: TimeSeriesData | null
): YearOverYearPair | null {
  if (!timeSeries) return null

  const currentProgramYear = timeSeries.currentProgramYear
  const currentYearData = timeSeries.years[currentProgramYear]
  if (!currentYearData || currentYearData.dataPoints.length === 0) return null

  const currentLatest =
    currentYearData.dataPoints[currentYearData.dataPoints.length - 1]!

  // Use the most recent prior year
  const priorYears = timeSeries.availableYears.filter(
    y => y !== currentProgramYear
  )
  if (priorYears.length === 0) return null

  const priorYearData = timeSeries.years[priorYears[0]!]
  if (!priorYearData || priorYearData.dataPoints.length === 0) return null

  const priorPoint = findClosestPriorYearPoint(
    priorYearData,
    currentLatest.date
  )
  if (!priorPoint) return null

  return { currentLatest, priorPoint }
}

/**
 * Whether the time-series year-over-year pair straddles the 2026 district
 * reformation with a roster that changed discontinuously (#1442).
 *
 * A district id that survived 2026-07-01 while absorbing (or shedding)
 * another district's clubs is not the district that held that id a year ago.
 * Both year-over-year functions below consult this before returning a figure;
 * the page also reads it directly so it can explain the absence instead of
 * showing a bare "N/A".
 *
 * Returns null when there is no comparable pair at all (the caller already
 * renders "no historical data" in that case).
 */
export function detectTimeSeriesReformationDiscontinuity(
  timeSeries: TimeSeriesData | null
): ReformationDiscontinuity | null {
  const pair = resolveYearOverYearPair(timeSeries)
  if (!pair) return null

  return detectReformationDiscontinuity({
    previousDate: pair.priorPoint.date,
    currentDate: pair.currentLatest.date,
    previousCount: pair.priorPoint.clubCounts.total,
    currentCount: pair.currentLatest.clubCounts.total,
  })
}

/**
 * Compute YoY comparison data from time-series hook output.
 *
 * @returns YoY data or null if prior year data is unavailable
 */
export function computeYearOverYear(
  timeSeries: TimeSeriesData | null
): YearOverYearData | null {
  const pair = resolveYearOverYearPair(timeSeries)
  if (!pair) return null

  const { currentLatest, priorPoint } = pair

  // #1442: across the 2026 reformation a merged/split district would read as
  // enormous organic growth it never had. A wrong number is worse than an
  // absent one — suppress, and let the page explain why.
  if (detectTimeSeriesReformationDiscontinuity(timeSeries)?.isDiscontinuous) {
    return null
  }

  // Compute percentage changes
  const membershipChange = percentChange(
    currentLatest.membership,
    priorPoint.membership
  )

  const distinguishedChange = percentChange(
    currentLatest.distinguishedTotal,
    priorPoint.distinguishedTotal
  )

  // Club health: % of thriving clubs
  const currentThrivingPct =
    currentLatest.clubCounts.total > 0
      ? (currentLatest.clubCounts.thriving / currentLatest.clubCounts.total) *
        100
      : 0
  const priorThrivingPct =
    priorPoint.clubCounts.total > 0
      ? (priorPoint.clubCounts.thriving / priorPoint.clubCounts.total) * 100
      : 0
  const clubHealthChange = percentChange(currentThrivingPct, priorThrivingPct)

  return {
    membershipChange: Math.round(membershipChange * 10) / 10,
    distinguishedChange: Math.round(distinguishedChange * 10) / 10,
    clubHealthChange: Math.round(clubHealthChange * 10) / 10,
  }
}

/**
 * Payment YoY result shape used by MembershipPaymentsChart.
 */
export interface PaymentYoYResult {
  yearOverYearChange: number
  trendDirection: 'up' | 'down' | 'stable'
}

/**
 * Compute payment Year-over-Year comparison from time-series data (#269).
 *
 * Bug #269: The usePaymentsTrend hook computed YoY from analytics CDN data
 * which only contains current-year payments, so `previousPayments` was always
 * null → YoY displayed "N/A". This function uses time-series CDN data which
 * has multi-year history.
 *
 * @returns Payment YoY data or null if prior year data is unavailable
 */
export function computePaymentYoYFromTimeSeries(
  timeSeries: TimeSeriesData | null
): PaymentYoYResult | null {
  const pair = resolveYearOverYearPair(timeSeries)
  if (!pair) return null

  const { currentLatest, priorPoint } = pair

  // #1442: same suppression as the membership comparison above — a district
  // that annexed another district's clubs did not take those payments in.
  if (detectTimeSeriesReformationDiscontinuity(timeSeries)?.isDiscontinuous) {
    return null
  }

  // Compute absolute change (not percentage — consistent with usePaymentsTrend)
  const change = currentLatest.payments - priorPoint.payments

  let direction: 'up' | 'down' | 'stable'
  if (change > 0) {
    direction = 'up'
  } else if (change < 0) {
    direction = 'down'
  } else {
    direction = 'stable'
  }

  return {
    yearOverYearChange: change,
    trendDirection: direction,
  }
}

/**
 * Extract the latest payments value from time-series data (#319).
 *
 * Used to ensure the Trends tab stat card reads from the same source
 * as the chart, avoiding discrepancies with performanceTargets CDN.
 */
export function getLatestPayments(
  timeSeries: TimeSeriesData | null
): number | null {
  if (!timeSeries) return null

  const currentYearData = timeSeries.years[timeSeries.currentProgramYear]
  if (!currentYearData || currentYearData.dataPoints.length === 0) return null

  const latest =
    currentYearData.dataPoints[currentYearData.dataPoints.length - 1]
  return latest?.payments ?? null
}
