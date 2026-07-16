/**
 * useAggregatedAnalytics Hook
 *
 * Fetches aggregated analytics data directly from Cloud CDN.
 * The Express /analytics-summary endpoint has been deleted (#173).
 *
 * Features:
 * - Fetches pre-computed analytics from CDN
 * - Converts CDN format to aggregated response format
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
  AggregatedAnalyticsResponse,
  UseAggregatedAnalyticsResult,
} from './aggregatedAnalytics/types'

import type { AggregatedAnalyticsResponse } from './aggregatedAnalytics/types'
import {
  fetchIndividualAnalytics,
  convertToAggregatedFormat,
} from './aggregatedAnalytics/helpers'
import type { SnapshotDate } from '../types/snapshotDate'

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook to fetch aggregated analytics data from CDN.
 *
 * Fetches pre-computed analytics from Cloud CDN and converts
 * to the aggregated response format used by the Overview tab.
 *
 * @param districtId - The district ID to fetch analytics for
 *
 * @example
 * const { data, isLoading, error } = useAggregatedAnalytics('42')
 *
 * Requirements: 5.1
 */
export function useAggregatedAnalytics(
  districtId: string | null,
  snapshotDate?: SnapshotDate
): {
  data: AggregatedAnalyticsResponse | null
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
  /** @deprecated Always true — CDN is the sole data source (#173) */
  usedFallback: boolean
} {
  const query = useQuery({
    queryKey: ['aggregatedAnalytics', districtId, snapshotDate],
    queryFn: async (): Promise<AggregatedAnalyticsResponse> => {
      if (!districtId) {
        throw new Error('District ID is required')
      }

      // Direct CDN fetch — no Express fallback (#173)
      const analytics = await fetchIndividualAnalytics(districtId, snapshotDate)
      return convertToAggregatedFormat(analytics)
    },
    enabled: !!districtId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: failureCount => failureCount < 2,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  })

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
    data: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error,
    refetch: () => query.refetch(),
    usedFallback: true, // Always CDN now — kept for backward compat
  }
}
