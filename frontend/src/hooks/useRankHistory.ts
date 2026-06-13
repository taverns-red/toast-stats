import { useQuery } from '@tanstack/react-query'
import { fetchCdnRankHistory } from '../services/cdn'
import type { RankHistoryResponse } from '../types/districts'
import { getProgramYearForDate } from '../utils/programYear'

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
  // Resolve from the explicit start date, else the most recent history point.
  // Route through getProgramYearForDate so the July-1 boundary is derived
  // timezone-invariantly (a `new Date(str).getMonth()` deriver rolls a
  // first-of-July date back to June in UTC-negative zones — #1116 item 2).
  const anchorDate = startDate ?? history?.[history.length - 1]?.date
  if (anchorDate) {
    const py = getProgramYearForDate(anchorDate)
    return {
      startDate: py.startDate,
      endDate: py.endDate,
      year: py.label,
    }
  }

  // Empty fallback
  return { startDate: '', endDate: '', year: '' }
}
