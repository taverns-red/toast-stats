/**
 * usePaymentsTrend Hook
 *
 * Fetches and transforms payment trend data with multi-year comparison.
 * Uses the existing useDistrictAnalytics hook to get payment data and
 * transforms it for the MembershipPaymentsChart component.
 *
 * Requirements: 2.1, 2.4, 6.2
 */

import { useMemo } from 'react'
import { useDistrictAnalytics } from './useDistrictAnalytics'
import type { DistrictPerformanceTargets } from './useDistrictAnalytics'
import { buildPaymentTrend, PaymentTrendDataPoint } from '../utils/paymentTrend'
import {
  getCurrentProgramYear,
  getProgramYear,
  getProgramYearForDate,
  ProgramYear,
} from '../utils/programYear'

/**
 * Multi-year payment data structure for chart rendering
 */
export interface MultiYearPaymentData {
  currentYear: {
    label: string
    data: PaymentTrendDataPoint[]
  }
  previousYears: Array<{
    label: string
    data: PaymentTrendDataPoint[]
  }>
}

/**
 * Statistics for year-over-year comparison
 */
export interface PaymentStatistics {
  currentPayments: number
  paymentBase: number | null
  yearOverYearChange: number | null
  trendDirection: 'up' | 'down' | 'stable' | null
}

/**
 * Result type for usePaymentsTrend hook
 */
export interface UsePaymentsTrendResult {
  data: {
    currentYearTrend: PaymentTrendDataPoint[]
    multiYearData: MultiYearPaymentData | null
    statistics: PaymentStatistics
  } | null
  isLoading: boolean
  error: Error | null
}

/**
 * Calculate year-over-year change and trend direction
 *
 * @param currentPayments - Current year's payment count
 * @param previousPayments - Previous year's payment count at same point
 * @returns Object with change value and trend direction
 *
 * Requirements: 6.2, 6.4
 */
export function calculateYearOverYearChange(
  currentPayments: number,
  previousPayments: number | null
): { change: number | null; direction: 'up' | 'down' | 'stable' | null } {
  if (previousPayments === null) {
    return { change: null, direction: null }
  }

  const change = currentPayments - previousPayments

  let direction: 'up' | 'down' | 'stable'
  if (change > 0) {
    direction = 'up'
  } else if (change < 0) {
    direction = 'down'
  } else {
    direction = 'stable'
  }

  return { change, direction }
}

/**
 * Group payment trend data by program year
 *
 * @param trendData - Array of payment trend data points
 * @returns Map of program year label to data points
 */
export function groupByProgramYear(
  trendData: PaymentTrendDataPoint[]
): Map<string, { programYear: ProgramYear; data: PaymentTrendDataPoint[] }> {
  const grouped = new Map<
    string,
    { programYear: ProgramYear; data: PaymentTrendDataPoint[] }
  >()

  for (const point of trendData) {
    const programYear = getProgramYearForDate(point.date)
    const label = programYear.label

    if (!grouped.has(label)) {
      grouped.set(label, { programYear, data: [] })
    }
    grouped.get(label)!.data.push(point)
  }

  return grouped
}

/**
 * Limit the number of years to display (max 3)
 *
 * @param groupedData - Map of program year data
 * @param maxYears - Maximum number of years to include (default 3)
 * @returns Filtered map with at most maxYears entries
 *
 * Requirements: 2.1, 2.4
 */
export function limitYearCount(
  groupedData: Map<
    string,
    { programYear: ProgramYear; data: PaymentTrendDataPoint[] }
  >,
  maxYears: number = 3
): Map<string, { programYear: ProgramYear; data: PaymentTrendDataPoint[] }> {
  // Sort by program year (most recent first)
  const sortedEntries = Array.from(groupedData.entries()).sort(
    ([, a], [, b]) => b.programYear.year - a.programYear.year
  )

  // Take only the most recent maxYears
  const limitedEntries = sortedEntries.slice(0, maxYears)

  return new Map(limitedEntries)
}

/**
 * Build multi-year payment data structure for chart rendering
 *
 * @param groupedData - Map of program year data (already limited)
 * @param currentProgramYear - The current program year
 * @returns MultiYearPaymentData structure or null if no data
 */
export function buildMultiYearData(
  groupedData: Map<
    string,
    { programYear: ProgramYear; data: PaymentTrendDataPoint[] }
  >,
  currentProgramYear: ProgramYear
): MultiYearPaymentData | null {
  if (groupedData.size === 0) {
    return null
  }

  const currentYearData = groupedData.get(currentProgramYear.label)
  const previousYears: Array<{ label: string; data: PaymentTrendDataPoint[] }> =
    []

  for (const [label, { data }] of groupedData) {
    if (label !== currentProgramYear.label) {
      previousYears.push({ label, data })
    }
  }

  // Sort previous years by label (most recent first)
  previousYears.sort((a, b) => b.label.localeCompare(a.label))

  return {
    currentYear: {
      label: currentProgramYear.label,
      data: currentYearData?.data ?? [],
    },
    previousYears,
  }
}

/**
 * Find the payment value at a comparable point in the previous year
 *
 * @param previousYearData - Previous year's payment trend data
 * @param currentProgramYearDay - The program year day to match
 * @returns The payment value at the closest matching day, or null
 */
export function findComparablePayment(
  previousYearData: PaymentTrendDataPoint[],
  currentProgramYearDay: number
): number | null {
  if (previousYearData.length === 0) {
    return null
  }

  const firstPoint = previousYearData[0]
  if (!firstPoint) {
    return null
  }

  // Find the data point with the closest programYearDay
  let closest: PaymentTrendDataPoint = firstPoint
  let minDiff = Math.abs(closest.programYearDay - currentProgramYearDay)

  for (const point of previousYearData) {
    const diff = Math.abs(point.programYearDay - currentProgramYearDay)
    if (diff < minDiff) {
      minDiff = diff
      closest = point
    }
  }

  // Only use if within 7 days of the target
  if (minDiff <= 7) {
    return closest.payments
  }

  return null
}

/**
 * Hook to fetch and transform payment trend data with multi-year comparison
 *
 * @param districtId - The district ID to fetch data for
 * @param programYearStartDate - Optional start date (defaults to current program year)
 * @param endDate - Optional end date
 * @param selectedProgramYear - Optional program year to use as the current year for grouping and statistics
 * @returns UsePaymentsTrendResult with payment trend data, loading, and error states
 *
 * Requirements: 2.1, 2.4, 6.2
 */
export function usePaymentsTrend(
  districtId: string | null,
  programYearStartDate?: string,
  endDate?: string,
  selectedProgramYear?: ProgramYear,
  performanceTargets?: DistrictPerformanceTargets | null
): UsePaymentsTrendResult {
  const currentProgramYear = selectedProgramYear ?? getCurrentProgramYear()

  // Calculate date range for fetching data (3 years back for comparison)
  const startDate =
    programYearStartDate ??
    getProgramYear(currentProgramYear.year - 2).startDate
  const queryEndDate = endDate ?? new Date().toISOString().split('T')[0]

  // Fetch analytics data using existing hook
  const {
    data: analyticsData,
    isLoading,
    error,
  } = useDistrictAnalytics(districtId, startDate, queryEndDate)

  // Transform the data
  const result = useMemo(() => {
    if (!analyticsData) {
      return null
    }

    // Get current payment values — prefer performanceTargets prop (from CDN hook),
    // fall back to analyticsData.performanceTargets (inline, usually undefined)
    const currentPayments =
      performanceTargets?.membershipPayments.current ??
      analyticsData.performanceTargets?.membershipPayments.current ??
      0
    const paymentBase =
      performanceTargets?.membershipPayments.base ??
      analyticsData.performanceTargets?.membershipPayments.base ??
      null

    // Build trend data from multi-year analytics data
    // Requirements: 1.1
    const rawTrend = analyticsData.paymentsTrend
    const trendData = rawTrend
      ? buildPaymentTrend(
          rawTrend.map(point => ({
            date: point.date,
            totalPayments: point.payments,
          }))
        )
      : []

    // Group by program year
    const grouped = groupByProgramYear(trendData)

    // Limit to 3 years
    const limited = limitYearCount(grouped, 3)

    // Build multi-year data structure
    const multiYearData = buildMultiYearData(limited, currentProgramYear)

    // Get current year trend
    const currentYearTrend = limited.get(currentProgramYear.label)?.data ?? []

    // Calculate year-over-year change
    let previousPayments: number | null = null
    if (multiYearData && multiYearData.previousYears.length > 0) {
      const mostRecentPreviousYear = multiYearData.previousYears[0]
      const lastCurrentPoint = currentYearTrend[currentYearTrend.length - 1]
      if (mostRecentPreviousYear && lastCurrentPoint) {
        const currentDay = lastCurrentPoint.programYearDay
        previousPayments = findComparablePayment(
          mostRecentPreviousYear.data,
          currentDay
        )
      }
    }

    const { change, direction } = calculateYearOverYearChange(
      currentPayments,
      previousPayments
    )

    return {
      currentYearTrend,
      multiYearData,
      statistics: {
        currentPayments,
        paymentBase,
        yearOverYearChange: change,
        trendDirection: direction,
      },
    }
  }, [analyticsData, currentProgramYear, performanceTargets])

  return {
    data: result,
    isLoading,
    error: error ?? null,
  }
}
