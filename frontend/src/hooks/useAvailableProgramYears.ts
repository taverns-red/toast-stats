import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchCdnDates } from '../services/cdn'
import type { AvailableRankingYearsResponse } from '../types/districts'

/**
 * Query key factory for available program years queries
 */
export const availableProgramYearsQueryKeys = {
  all: ['available-ranking-years'] as const,
  byDistrict: (districtId: string) =>
    ['available-ranking-years', districtId] as const,
}

interface UseAvailableProgramYearsParams {
  /** District ID to fetch available program years for */
  districtId: string
  /** Whether the query should be enabled (default: true) */
  enabled?: boolean
}

interface UseAvailableProgramYearsResult {
  /** The available program years data */
  data: AvailableRankingYearsResponse | undefined
  /** Whether the query is currently loading */
  isLoading: boolean
  /** Whether the query encountered an error */
  isError: boolean
  /** The error if one occurred */
  error: Error | null
  /** Whether the data is loaded but contains no program years */
  isEmpty: boolean
  /** Function to manually refetch the data */
  refetch: () => void
}

/**
 * Derive program year from a date string (YYYY-MM-DD).
 * Program years run Jul 1 – Jun 30. A date in Jan-Jun belongs to the
 * program year that started the previous July.
 */
function getProgramYear(dateStr: string): string {
  const [yearStr, monthStr] = dateStr.split('-')
  const year = parseInt(yearStr!, 10)
  const month = parseInt(monthStr!, 10)
  // Jul-Dec → year–(year+1), Jan-Jun → (year-1)–year
  const startYear = month >= 7 ? year : year - 1
  return `${startYear}-${startYear + 1}`
}

/**
 * React Query hook to fetch available program years with ranking data from CDN (#173).
 *
 * Derives program years from the CDN dates index. Groups all snapshot dates
 * by program year (Jul 1 – Jun 30) and returns the same shape as the
 * Express endpoint for backward compatibility.
 */
export const useAvailableProgramYears = ({
  districtId,
  enabled = true,
}: UseAvailableProgramYearsParams): UseAvailableProgramYearsResult => {
  const query: UseQueryResult<AvailableRankingYearsResponse, Error> = useQuery<
    AvailableRankingYearsResponse,
    Error
  >({
    queryKey: availableProgramYearsQueryKeys.byDistrict(districtId),
    queryFn: async () => {
      const { dates } = await fetchCdnDates()

      // Group dates by program year
      const yearMap = new Map<string, { dates: string[]; latestDate: string }>()
      for (const d of dates) {
        const py = getProgramYear(d)
        const entry = yearMap.get(py)
        if (entry) {
          entry.dates.push(d)
          if (d > entry.latestDate) entry.latestDate = d
        } else {
          yearMap.set(py, { dates: [d], latestDate: d })
        }
      }

      // Build program years array
      const now = new Date()
      const programYears = Array.from(yearMap.entries())
        .sort(([a], [b]) => b.localeCompare(a)) // newest first
        .map(([year, { dates: yearDates, latestDate }]) => {
          const [startYearStr] = year.split('-')
          const startYear = parseInt(startYearStr!, 10)
          const endDate = new Date(`${startYear + 1}-06-30T23:59:59`)
          return {
            year,
            startDate: `${startYear}-07-01`,
            endDate: `${startYear + 1}-06-30`,
            hasCompleteData: endDate < now,
            snapshotCount: yearDates.length,
            latestSnapshotDate: latestDate,
          }
        })

      return { districtId, programYears }
    },
    enabled: enabled && !!districtId,
    staleTime: 15 * 60 * 1000, // 15 minutes
    retry: failureCount => failureCount < 2,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  })

  // Compute isEmpty: data is loaded but contains no program years
  const isEmpty =
    !query.isLoading &&
    !query.isError &&
    (query.data?.programYears?.length ?? 0) === 0

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isEmpty,
    refetch: query.refetch,
  }
}
