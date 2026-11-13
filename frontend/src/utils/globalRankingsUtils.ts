/**
 * Pure utility functions for global rankings computation.
 *
 * Extracted from useGlobalRankings hook to enable unit testing
 * without React rendering overhead.
 */

import type {
  RankHistoryResponse,
  ProgramYearWithData,
  HistoricalRankPoint,
} from '../types/districts'
import type { ProgramYear } from '../utils/programYear'
import { MetricRankingsCalculator } from '@taverns-red/analytics-core'

// ========== Type Definitions ==========

/**
 * Rank position with total districts and percentile
 */
export interface RankPosition {
  /** The rank (1 = best) */
  rank: number
  /** Total number of districts ranked */
  totalDistricts: number
  /** Percentile (0-100, higher = better) */
  percentile: number
}

/**
 * End-of-year rankings for all four metrics
 */
export interface EndOfYearRankings {
  /** Overall aggregate rank */
  overall: RankPosition
  /** Paid clubs rank */
  paidClubs: RankPosition
  /** Membership payments rank */
  membershipPayments: RankPosition
  /** Distinguished clubs rank */
  distinguishedClubs: RankPosition
  /** Date of the ranking data (ISO string) */
  asOfDate: string
  /** Whether this is partial year data (year not complete) */
  isPartialYear: boolean
}

/**
 * Year-over-year change for each metric
 * Positive values indicate improvement (rank went down numerically)
 * Negative values indicate decline (rank went up numerically)
 */
export interface YearOverYearChange {
  /** Overall rank change */
  overall: number
  /** Clubs rank change */
  clubs: number
  /** Payments rank change */
  payments: number
  /** Distinguished rank change */
  distinguished: number
}

/**
 * Summary of rankings for a single program year
 */
export interface YearlyRankingSummary {
  /** Program year identifier (e.g., "2023-2024") */
  programYear: string
  /** Overall aggregate rank */
  overallRank: number
  /** Paid clubs rank */
  clubsRank: number
  /** Membership payments rank */
  paymentsRank: number
  /** Distinguished clubs rank */
  distinguishedRank: number
  /** Total number of districts ranked */
  totalDistricts: number
  /** Whether this is partial year data */
  isPartialYear: boolean
  /** Year-over-year change (null for oldest year) */
  yearOverYearChange: YearOverYearChange | null
}

/**
 * Parameters for the useGlobalRankings hook
 */
export interface UseGlobalRankingsParams {
  /** District ID to fetch rankings for */
  districtId: string
  /** Selected program year (optional, defaults to most recent) */
  selectedProgramYear?: ProgramYear
}

/**
 * Result from the useGlobalRankings hook
 */
export interface UseGlobalRankingsResult {
  // Current year data
  /** Rank history for the selected program year */
  currentYearHistory: RankHistoryResponse | null
  /** End-of-year rankings for the selected program year */
  endOfYearRankings: EndOfYearRankings | null

  // Multi-year data
  /** All available program years with ranking data */
  availableProgramYears: ProgramYear[]
  /** Summary rankings for all available years */
  yearlyRankings: YearlyRankingSummary[]

  // State
  /** Whether the initial years data is loading (blocks all rendering) */
  isLoading: boolean
  /** Whether the selected year's rank history chart data is loading */
  isLoadingChart: boolean
  /** Whether the multi-year comparison data is loading */
  isLoadingMultiYear: boolean
  /** Whether an error occurred */
  isError: boolean
  /** The error if one occurred */
  error: Error | null

  // Actions
  /** Function to refetch all data */
  refetch: () => void
}

// ========== Helper Functions ==========

const calculator = new MetricRankingsCalculator()

/**
 * Convert ProgramYearWithData to ProgramYear format
 */
export function convertToProgramYear(
  programYearWithData: ProgramYearWithData
): ProgramYear {
  // Extract the starting year from the year string (e.g., "2023-2024" -> 2023)
  const yearParts = programYearWithData.year.split('-')
  const startYear = parseInt(yearParts[0] ?? '0', 10)

  return {
    year: startYear,
    startDate: programYearWithData.startDate,
    endDate: programYearWithData.endDate,
    label: programYearWithData.year,
  }
}

/**
 * Extract end-of-year rankings from rank history data.
 * Uses the most recent data point in the history as the end-of-year ranking.
 *
 * @param history - The rank history response
 * @param programYearData - Program year metadata including completeness status
 * @returns End-of-year rankings or null if no history data
 */
export function extractEndOfYearRankings(
  history: RankHistoryResponse | null,
  programYearData: ProgramYearWithData | undefined
): EndOfYearRankings | null {
  if (!history || history.history.length === 0) {
    return null
  }

  // Get the most recent data point (last in the sorted array)
  const sortedHistory = [...history.history].sort((a, b) =>
    a.date.localeCompare(b.date)
  )
  const latestPoint = sortedHistory[sortedHistory.length - 1]

  if (!latestPoint) {
    return null
  }

  // Use totalDistricts from the data point itself
  const totalDistricts = latestPoint.totalDistricts

  // One formula everywhere, (n - r) / n, shared with the KPI cards (#2613).
  const calculatePercentile = (rank: number): number =>
    calculator.calculateWorldPercentile(rank, totalDistricts) ?? 0

  // Use overallRank from API if available (based on aggregateScore position)
  // Fall back to averaging category ranks for legacy data without overallRank
  const overallRank =
    latestPoint.overallRank ??
    Math.round(
      (latestPoint.clubsRank +
        latestPoint.paymentsRank +
        latestPoint.distinguishedRank) /
        3
    )

  return {
    overall: {
      rank: overallRank,
      totalDistricts,
      percentile: calculatePercentile(overallRank),
    },
    paidClubs: {
      rank: latestPoint.clubsRank,
      totalDistricts,
      percentile: calculatePercentile(latestPoint.clubsRank),
    },
    membershipPayments: {
      rank: latestPoint.paymentsRank,
      totalDistricts,
      percentile: calculatePercentile(latestPoint.paymentsRank),
    },
    distinguishedClubs: {
      rank: latestPoint.distinguishedRank,
      totalDistricts,
      percentile: calculatePercentile(latestPoint.distinguishedRank),
    },
    asOfDate: latestPoint.date,
    isPartialYear: programYearData ? !programYearData.hasCompleteData : true,
  }
}

/**
 * Calculate year-over-year rank changes.
 * Positive values indicate improvement (rank number decreased).
 * Negative values indicate decline (rank number increased).
 *
 * @param currentYear - Current year's end-of-year rankings
 * @param previousYear - Previous year's end-of-year rankings
 * @returns Year-over-year changes or null if previous year data unavailable
 */
export function calculateYearOverYearChange(
  currentYear: EndOfYearRankings | null,
  previousYear: EndOfYearRankings | null
): YearOverYearChange | null {
  if (!currentYear || !previousYear) {
    return null
  }

  // Change is calculated as previous - current
  // If rank improved (went from 10 to 5), change is 10 - 5 = 5 (positive = improvement)
  // If rank declined (went from 5 to 10), change is 5 - 10 = -5 (negative = decline)
  return {
    overall: previousYear.overall.rank - currentYear.overall.rank,
    clubs: previousYear.paidClubs.rank - currentYear.paidClubs.rank,
    payments:
      previousYear.membershipPayments.rank -
      currentYear.membershipPayments.rank,
    distinguished:
      previousYear.distinguishedClubs.rank -
      currentYear.distinguishedClubs.rank,
  }
}

/**
 * Extract the latest rank point from history data
 */
export function getLatestRankPoint(
  history: HistoricalRankPoint[]
): HistoricalRankPoint | null {
  if (history.length === 0) return null

  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))
  return sorted[sorted.length - 1] ?? null
}

/**
 * Build yearly ranking summaries from available program years and their history data
 */
export function buildYearlyRankingSummaries(
  programYears: ProgramYearWithData[],
  historyByYear: Map<string, RankHistoryResponse>
): YearlyRankingSummary[] {
  // Sort program years in descending order (most recent first)
  const sortedYears = [...programYears].sort((a, b) =>
    b.year.localeCompare(a.year)
  )

  const summaries: YearlyRankingSummary[] = []

  // Track previous year's ranks for year-over-year calculation
  let previousOverallRank: number | null = null
  let previousClubsRank: number | null = null
  let previousPaymentsRank: number | null = null
  let previousDistinguishedRank: number | null = null

  // Process in reverse order (oldest first) to calculate year-over-year changes
  const reversedYears = [...sortedYears].reverse()

  for (const yearData of reversedYears) {
    const history = historyByYear.get(yearData.year)
    const latestPoint = history ? getLatestRankPoint(history.history) : null

    if (!latestPoint) {
      // Skip years without data
      continue
    }

    // Use overallRank from API if available (based on aggregateScore position)
    // Fall back to averaging category ranks for legacy data without overallRank
    const overallRank =
      latestPoint.overallRank ??
      Math.round(
        (latestPoint.clubsRank +
          latestPoint.paymentsRank +
          latestPoint.distinguishedRank) /
          3
      )

    // Calculate year-over-year change directly from previous ranks
    // Positive change = improvement (rank number decreased)
    // Negative change = decline (rank number increased)
    let yearOverYearChange: YearOverYearChange | null = null

    if (
      previousOverallRank !== null &&
      previousClubsRank !== null &&
      previousPaymentsRank !== null &&
      previousDistinguishedRank !== null
    ) {
      yearOverYearChange = {
        overall: previousOverallRank - overallRank,
        clubs: previousClubsRank - latestPoint.clubsRank,
        payments: previousPaymentsRank - latestPoint.paymentsRank,
        distinguished:
          previousDistinguishedRank - latestPoint.distinguishedRank,
      }
    }

    summaries.push({
      programYear: yearData.year,
      overallRank,
      clubsRank: latestPoint.clubsRank,
      paymentsRank: latestPoint.paymentsRank,
      distinguishedRank: latestPoint.distinguishedRank,
      totalDistricts: latestPoint.totalDistricts,
      isPartialYear: !yearData.hasCompleteData,
      yearOverYearChange,
    })

    // Update previous ranks for next iteration
    previousOverallRank = overallRank
    previousClubsRank = latestPoint.clubsRank
    previousPaymentsRank = latestPoint.paymentsRank
    previousDistinguishedRank = latestPoint.distinguishedRank
  }

  // Reverse to get most recent first
  return summaries.reverse()
}
