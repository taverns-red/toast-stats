/**
 * District → region history (#1820) for PY-scoped region membership (#1821).
 * One query, one cache entry, shared by region pages and the district page.
 * `history: null` means "not available" — callers fall back to the rankings
 * row's own `region`, so a missing file never blanks a page.
 */
import { useQuery } from '@tanstack/react-query'
import type { DistrictRegionHistory } from '@taverns-red/shared-contracts'
import { fetchCdnDistrictRegionHistory } from '../services/cdn'

export const DISTRICT_REGION_HISTORY_QUERY_KEY = [
  'district-region-history',
] as const

export function useDistrictRegionHistory(): {
  history: DistrictRegionHistory | null
} {
  const query = useQuery({
    queryKey: DISTRICT_REGION_HISTORY_QUERY_KEY,
    queryFn: fetchCdnDistrictRegionHistory,
    // Rebuilt by the daily pipeline; the mapping changes once a year.
    staleTime: 60 * 60 * 1000,
  })
  return { history: query.data ?? null }
}
