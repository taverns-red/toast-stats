/**
 * Compute Year-over-Year comparison from time-series data (#170).
 *
 * Compares the latest data point of the current program year to the
 * closest-month data point of the prior program year. Returns percentage
 * changes for membership, distinguished clubs, and club health.
 */

import type { ProgramYearIndexFile } from '@toastmasters/shared-contracts'
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
 * Compute YoY comparison data from time-series hook output.
 *
 * @returns YoY data or null if prior year data is unavailable
 */
export function computeYearOverYear(
  timeSeries: TimeSeriesData | null
): YearOverYearData | null {
  if (!timeSeries) return null

  const currentProgramYear = timeSeries.currentProgramYear
  const currentYearData = timeSeries.years[currentProgramYear]

  if (!currentYearData || currentYearData.dataPoints.length === 0) return null

  // Find latest data point of current year
  const currentLatest =
    currentYearData.dataPoints[currentYearData.dataPoints.length - 1]!

  // Find prior year
  const priorYears = timeSeries.availableYears.filter(
    y => y !== currentProgramYear
  )
  if (priorYears.length === 0) return null

  // Use the most recent prior year
  const priorProgramYear = priorYears[0]!
  const priorYearData = timeSeries.years[priorProgramYear]
  if (!priorYearData || priorYearData.dataPoints.length === 0) return null

  // Find closest matching data point in prior year
  const priorPoint = findClosestPriorYearPoint(
    priorYearData,
    currentLatest.date
  )
  if (!priorPoint) return null

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
