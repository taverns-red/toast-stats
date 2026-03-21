/**
 * useTimeSeries Hook
 *
 * Fetches time-series data from Cloud CDN for a district.
 * Loads the current program year + up to 2 prior years for YoY comparison.
 *
 * Data flow:
 *   1. Fetch index-metadata.json → available program years
 *   2. Fetch {programYear}.json for each available year (up to 3)
 *   3. Return typed data with membership/payment trends + base membership
 *
 * Base membership rule:
 *   - Last data point of the prior program year
 *   - Fallback: first data point of the current year
 *   - Fallback: 0
 *
 * #170 — Time-series integration
 */

import { useQuery } from '@tanstack/react-query'
import type { ProgramYearIndexFile } from '@toastmasters/shared-contracts'
import {
  fetchTimeSeriesMetadata,
  fetchTimeSeriesProgramYear,
  getCurrentProgramYear,
  getPreviousProgramYears,
} from '../services/cdnTimeSeries'

/**
 * Data returned by the useTimeSeries hook.
 */
export interface TimeSeriesData {
  /** Current program year string (e.g. "2025-2026") */
  currentProgramYear: string
  /** Full index files keyed by program year */
  years: Record<string, ProgramYearIndexFile>
  /** Available program years (most recent first) */
  availableYears: string[]
  /** Base membership count (last point of prior year, or first of current) */
  baseMembership: number
  /** Current membership count (last point of current year) */
  currentMembership: number
  /** Net member change = currentMembership - baseMembership */
  memberChange: number
}

/**
 * Compute base membership from time-series data.
 *
 * Rule: last data point of prior program year.
 * Fallback: first data point of current year.
 * Fallback: 0.
 */
function computeBaseMembership(
  years: Record<string, ProgramYearIndexFile>,
  currentProgramYear: string,
  priorProgramYear: string | undefined
): number {
  // Try last point of prior year
  if (priorProgramYear && years[priorProgramYear]) {
    const priorData = years[priorProgramYear]
    if (priorData && priorData.dataPoints.length > 0) {
      return priorData.dataPoints[priorData.dataPoints.length - 1]!.membership
    }
  }

  // Fallback: first point of current year
  const currentData = years[currentProgramYear]
  if (currentData && currentData.dataPoints.length > 0) {
    return currentData.dataPoints[0]!.membership
  }

  return 0
}

/**
 * Hook to fetch time-series data for a district from CDN.
 *
 * Fetches metadata first, then loads the current + up to 2 prior program years.
 * Computes base membership and member change for the "+N members" badge.
 *
 * @param districtId - District ID to fetch data for (null to skip)
 */
export function useTimeSeries(districtId: string | null) {
  const query = useQuery({
    queryKey: ['timeSeries', districtId],
    queryFn: async (): Promise<TimeSeriesData> => {
      if (!districtId) {
        throw new Error('District ID is required')
      }

      // Step 1: Fetch metadata to discover available program years
      const metadata = await fetchTimeSeriesMetadata(districtId)

      const currentProgramYear = getCurrentProgramYear()
      const desiredPriorYears = getPreviousProgramYears(currentProgramYear, 2)

      // Step 2: Determine which years to fetch (current + available priors)
      const yearsToFetch = [
        currentProgramYear,
        ...desiredPriorYears.filter(y =>
          metadata.availableProgramYears.includes(y)
        ),
      ].filter(y => metadata.availableProgramYears.includes(y))

      // Step 3: Fetch all years in parallel
      const fetchedEntries = await Promise.all(
        yearsToFetch.map(async year => {
          try {
            const data = await fetchTimeSeriesProgramYear(districtId, year)
            return [year, data] as const
          } catch {
            // Non-fatal: skip years that fail to fetch
            return null
          }
        })
      )

      const years: Record<string, ProgramYearIndexFile> = {}
      for (const entry of fetchedEntries) {
        if (entry) {
          years[entry[0]] = entry[1]
        }
      }

      // Step 4: Compute base membership
      const priorProgramYear = desiredPriorYears[0]
      const baseMembership = computeBaseMembership(
        years,
        currentProgramYear,
        priorProgramYear
      )

      // Step 5: Get current membership (last point of current year)
      const currentYearData = years[currentProgramYear]
      const currentMembership =
        currentYearData && currentYearData.dataPoints.length > 0
          ? currentYearData.dataPoints[currentYearData.dataPoints.length - 1]!
              .membership
          : 0

      return {
        currentProgramYear,
        years,
        availableYears: yearsToFetch.filter(y => y in years),
        baseMembership,
        currentMembership,
        memberChange: currentMembership - baseMembership,
      }
    },
    enabled: !!districtId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: failureCount => failureCount < 2,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  })

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error instanceof Error ? query.error : null,
    refetch: () => query.refetch(),
  }
}
