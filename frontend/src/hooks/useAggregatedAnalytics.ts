/**
 * useAggregatedAnalytics Hook
 *
 * Provides functionality for fetching aggregated analytics data from the
 * `/api/districts/:districtId/analytics-summary` endpoint.
 *
 * Features:
 * - Fetches combined summary, trends, and yearOverYear data in a single request
 * - Falls back to individual endpoints if the aggregated endpoint fails
 * - Uses React Query for caching and state management
 *
 * Requirements: 5.1
 */

import { useQuery } from '@tanstack/react-query'

// Re-export types for backward compatibility
export type {
  ClubCounts,
  DistinguishedClubs,
  AnalyticsSummary,
  MembershipTrendPoint,
  PaymentsTrendPoint,
  TrendData,
  YearOverYearComparison,
  PerformanceTargets,
  AggregatedAnalyticsResponse,
  UseAggregatedAnalyticsResult,
} from './aggregatedAnalytics/types'

import type {
  AggregatedAnalyticsResponse,
  UseAggregatedAnalyticsResult,
} from './aggregatedAnalytics/types'
import {
  fetchAggregatedAnalytics,
  fetchIndividualAnalytics,
  convertToAggregatedFormat,
} from './aggregatedAnalytics/helpers'

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook to fetch aggregated analytics data
 *
 * Fetches from the `/api/districts/:districtId/analytics-summary` endpoint
 * which returns combined summary, trends, and yearOverYear data.
 *
 * Falls back to individual endpoints if the aggregated endpoint fails.
 *
 * @param districtId - The district ID to fetch analytics for
 * @param startDate - Optional start date for the analytics range (YYYY-MM-DD)
 * @param endDate - Optional end date for the analytics range (YYYY-MM-DD)
 *
 * @example
 * const { data, isLoading, error, usedFallback } = useAggregatedAnalytics('42')
 *
 * // With date range
 * const { data } = useAggregatedAnalytics('42', '2024-07-01', '2024-12-31')
 *
 * Requirements: 5.1
 */
export function useAggregatedAnalytics(
  districtId: string | null,
  startDate?: string,
  endDate?: string
): UseAggregatedAnalyticsResult {
  // Validate date range - don't make request if startDate > endDate
  const hasValidDateRange = !startDate || !endDate || startDate <= endDate

  // Combined query that tries aggregated endpoint first, then falls back to individual
  const query = useQuery({
    queryKey: ['aggregatedAnalytics', districtId, startDate, endDate],
    queryFn: async (): Promise<{
      data: AggregatedAnalyticsResponse
      usedFallback: boolean
    }> => {
      if (!districtId) {
        throw new Error('District ID is required')
      }

      // Try aggregated endpoint first
      try {
        const data = await fetchAggregatedAnalytics(
          districtId,
          startDate,
          endDate
        )
        return { data, usedFallback: false }
      } catch {
        // Fall back to CDN individual analytics endpoint
        const analytics = await fetchIndividualAnalytics(districtId)
        const data = convertToAggregatedFormat(analytics)
        return { data, usedFallback: true }
      }
    },
    enabled: !!districtId && hasValidDateRange,
    staleTime: 5 * 60 * 1000, // 5 minutes - matches backend cache TTL
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: (failureCount, error: unknown) => {
      // Don't retry on 404 (no data) or 400 (bad request)
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { status?: number } }
        if (
          axiosError.response?.status === 404 ||
          axiosError.response?.status === 400
        ) {
          return false
        }
      }
      // Retry up to 2 times for other errors
      return failureCount < 2
    },
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  })

  const refetch = () => {
    query.refetch()
  }

  // Convert error to Error type if needed
  let error: Error | null = null
  if (query.error) {
    if (query.error instanceof Error) {
      error = query.error
    } else if (typeof query.error === 'object' && 'message' in query.error) {
      error = new Error(String((query.error as { message: unknown }).message))
    } else {
      error = new Error('An unknown error occurred')
    }
  }

  return {
    data: query.data?.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error,
    refetch,
    usedFallback: query.data?.usedFallback ?? false,
  }
}
