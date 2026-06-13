import { useQuery } from '@tanstack/react-query'
import { fetchCdnRankHistory } from '../services/cdn'
import type { RankHistoryResponse } from '../types/districts'

interface UseRankHistoryParams {
  districtIds: string[]
  startDate?: string
  endDate?: string
}

/**
 * React Query hook to fetch historical rank data for multiple districts.
 * Fetches pre-computed rank history from CDN (one JSON per district).
 * Date filtering is done client-side.
 */
export const useRankHistory = ({
  districtIds,
  startDate,
  endDate,
}: UseRankHistoryParams) => {
  return useQuery<RankHistoryResponse[], Error>({
    queryKey: ['rank-history', districtIds, startDate, endDate],
    queryFn: async () => {
      // Fetch each district's rank history from CDN in parallel
      const results = await Promise.all(
        districtIds.map(async id => {
          try {
            const data = await fetchCdnRankHistory(id)

            // Client-side date filtering
            let history = data.history
            if (startDate || endDate) {
              history = history.filter(point => {
                if (startDate && point.date < startDate) return false
                if (endDate && point.date > endDate) return false
                return true
              })
            }

            // Derive program year from the date range
            const programYear = deriveProgramYear(startDate, endDate, history)

            return {
              districtId: data.districtId,
              districtName: data.districtName,
              history,
              programYear,
            } satisfies RankHistoryResponse
          } catch {
            // Return empty history for districts not found on CDN
            return {
              districtId: id,
              districtName: `District ${id}`,
              history: [],
              programYear: deriveProgramYear(startDate, endDate, []),
            } satisfies RankHistoryResponse
          }
        })
      )
      return results
    },
    enabled: districtIds.length > 0,
    staleTime: 15 * 60 * 1000, // 15 minutes
    retry: 2,
  })
}

/**
 * Derive a ProgramYearInfo from the start/end date range or history data.
 *
 * Exported for unit testing of the timezone-boundary behaviour (#1116 item 2).
 */
export function deriveProgramYear(
  startDate?: string,
  _endDate?: string,
  history?: Array<{ date: string }>
) {
  // If explicit dates provided, derive from them
  if (startDate) {
    const start = new Date(startDate)
    const startYear =
      start.getMonth() >= 6 ? start.getFullYear() : start.getFullYear() - 1
    return {
      startDate: `${startYear}-07-01`,
      endDate: `${startYear + 1}-06-30`,
      year: `${startYear}-${startYear + 1}`,
    }
  }

  // Fall back to the most recent history point
  if (history?.length) {
    const latestDate = history[history.length - 1]!.date
    const latest = new Date(latestDate)
    const startYear =
      latest.getMonth() >= 6 ? latest.getFullYear() : latest.getFullYear() - 1
    return {
      startDate: `${startYear}-07-01`,
      endDate: `${startYear + 1}-06-30`,
      year: `${startYear}-${startYear + 1}`,
    }
  }

  // Empty fallback
  return { startDate: '', endDate: '', year: '' }
}
