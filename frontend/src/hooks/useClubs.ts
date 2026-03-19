import { useQuery } from '@tanstack/react-query'
import { fetchCdnManifest, fetchCdnDistrictSnapshot } from '../services/cdn'
import type { ClubsResponse, DistrictStatistics } from '../types/districts'

/**
 * React Query hook to fetch clubs data for a district from CDN (#173).
 * Reads the raw district snapshot and extracts the clubPerformance array.
 */
export const useClubs = (districtId: string | null) => {
  return useQuery<ClubsResponse, Error>({
    queryKey: ['clubs', districtId],
    queryFn: async () => {
      if (!districtId) {
        throw new Error('District ID is required')
      }
      const { latestSnapshotDate } = await fetchCdnManifest()
      const snapshot = await fetchCdnDistrictSnapshot<DistrictStatistics>(
        latestSnapshotDate,
        districtId
      )
      return {
        clubs: (snapshot.clubPerformance ?? []) as ClubsResponse['clubs'],
      }
    },
    enabled: !!districtId,
    staleTime: 15 * 60 * 1000, // 15 minutes
    retry: 2,
  })
}
