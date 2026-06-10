/**
 * Type definitions for aggregated analytics hook.
 */

/**
 * Club counts breakdown by health status
 */
export interface ClubCounts {
  /** Total number of clubs */
  total: number
  /** Number of thriving clubs */
  thriving: number
  /** Number of vulnerable clubs */
  vulnerable: number
  /** Number of clubs requiring intervention */
  interventionRequired: number
}

/**
 * Distinguished clubs breakdown by level
 */
export interface DistinguishedClubs {
  /** Number of Smedley Distinguished clubs */
  smedley: number
  /** Number of President's Distinguished clubs */
  presidents: number
  /** Number of Select Distinguished clubs */
  select: number
  /** Number of Distinguished clubs */
  distinguished: number
  /** Total distinguished clubs */
  total: number
}

/**
 * Summary analytics data from pre-computed analytics
 */
export interface AnalyticsSummary {
  /** Total membership count */
  totalMembership: number
  /** Change in membership from previous period */
  membershipChange: number
  /** Change in actual member count between snapshots */
  memberCountChange: number
  /** Club counts by health status */
  clubCounts: ClubCounts
  /** Distinguished clubs by level */
  distinguishedClubs: DistinguishedClubs
  /** Projected number of distinguished clubs by end of program year */
  distinguishedProjection: number
}

/**
 * Membership trend data point
 */
export interface MembershipTrendPoint {
  /** Date of the data point (YYYY-MM-DD) */
  date: string
  /** Membership count at this date */
  count: number
}

/**
 * Payments trend data point
 */
export interface PaymentsTrendPoint {
  /** Date of the data point (YYYY-MM-DD) */
  date: string
  /** Number of payments at this date */
  payments: number
}

/**
 * Trend data from time-series index
 */
export interface TrendData {
  /** Membership trend over time */
  membership: MembershipTrendPoint[]
  /** Payments trend over time (optional) */
  payments?: PaymentsTrendPoint[]
}

/**
 * Year-over-year comparison metrics
 */
export interface YearOverYearComparison {
  /** Change in membership compared to same period last year */
  membershipChange: number
  /** Change in distinguished clubs compared to same period last year */
  distinguishedChange: number
  /** Change in club health metrics compared to same period last year */
  clubHealthChange: number
}

/**
 * Aggregated analytics response from CDN analytics-summary JSON
 */
export interface AggregatedAnalyticsResponse {
  /** District identifier */
  districtId: string
  /** Date range for the analytics data */
  dateRange: {
    /** Start date (YYYY-MM-DD) */
    start: string
    /** End date (YYYY-MM-DD) */
    end: string
  }
  /** Summary analytics data */
  summary: AnalyticsSummary
  /** Trend data from time-series index */
  trends: TrendData
  /** Year-over-year comparison (optional) */
  yearOverYear?: YearOverYearComparison
  /** Source of the data: 'precomputed' or 'computed' */
  dataSource: 'precomputed' | 'computed'
  /** ISO timestamp when the data was computed */
  computedAt: string
}

/**
 * Result type for the useAggregatedAnalytics hook
 */
export interface UseAggregatedAnalyticsResult {
  /** The aggregated analytics data */
  data: AggregatedAnalyticsResponse | null
  /** Whether the query is currently loading */
  isLoading: boolean
  /** Whether the query encountered an error */
  isError: boolean
  /** Error object if the query failed */
  error: Error | null
  /** Function to manually trigger a refetch */
  refetch: () => void
  /** Whether fallback to individual endpoints was used */
  usedFallback: boolean
}
