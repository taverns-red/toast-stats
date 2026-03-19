import { useQuery } from '@tanstack/react-query'
import { fetchCdnManifest, fetchCdnDistrictAnalytics } from '../services/cdn'
import type { EducationalAwardsResponse } from '../types/districts'

/**
 * React Query hook to fetch educational awards data for a district from CDN (#173).
 * Reads the distinguished-analytics pre-computed file.
 */
export const useEducationalAwards = (
  districtId: string | null,
  _months: number = 12
) => {
  return useQuery<EducationalAwardsResponse, Error>({
    queryKey: ['educationalAwards', districtId, _months],
    queryFn: async () => {
      if (!districtId) {
        throw new Error('District ID is required')
      }
      const { latestSnapshotDate } = await fetchCdnManifest()
      return fetchCdnDistrictAnalytics<EducationalAwardsResponse>(
        latestSnapshotDate,
        districtId,
        'distinguished-analytics'
      )
    },
    enabled: !!districtId,
    staleTime: 15 * 60 * 1000, // 15 minutes
    retry: 2,
  })
}
