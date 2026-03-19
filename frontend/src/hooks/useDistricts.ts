import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { fetchCdnRankings } from '../services/cdn'
import type { DistrictsResponse } from '../types/districts'

/**
 * React Query hook to fetch available districts.
 * Derives district list from CDN rankings data (#173).
 */
export const useDistricts = (): UseQueryResult<DistrictsResponse, Error> => {
  return useQuery<DistrictsResponse, Error>({
    queryKey: ['districts'],
    queryFn: async () => {
      const { rankings } = await fetchCdnRankings()
      return {
        districts: rankings.map(r => ({
          id: r.districtId,
          name: r.districtName,
        })),
      }
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
    retry: 2,
  })
}
