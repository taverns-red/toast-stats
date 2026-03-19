import { useQuery } from '@tanstack/react-query'
import {
  fetchCdnManifest,
  fetchCdnDistrictSnapshot,
  fetchCdnDistrictAnalytics,
} from '../services/cdn'
import type {
  DistrictStatistics,
  MembershipHistoryResponse,
} from '../types/districts'

/**
 * React Query hook to fetch district statistics from CDN (#173).
 * Reads the raw district snapshot JSON.
 *
 * @param districtId - The district ID to fetch statistics for
 * @param selectedDate - Optional date in YYYY-MM-DD format. When provided, fetches
 *   that specific snapshot. When undefined, fetches the latest snapshot.
 * @param fields - Optional field selector (kept for API compatibility but CDN
 *   always returns the full snapshot).
 */
export const useDistrictStatistics = (
  districtId: string | null,
  selectedDate?: string,
  fields?: 'divisions' | 'clubs' | 'all'
) => {
  return useQuery<DistrictStatistics, Error>({
    queryKey: ['districtStatistics', districtId, selectedDate, fields],
    queryFn: async () => {
      if (!districtId) {
        throw new Error('District ID is required')
      }
      const date = selectedDate || (await fetchCdnManifest()).latestSnapshotDate
      return fetchCdnDistrictSnapshot<DistrictStatistics>(date, districtId)
    },
    enabled: !!districtId,
    staleTime: 15 * 60 * 1000, // 15 minutes
    retry: 2,
  })
}

/**
 * React Query hook to fetch membership history data from CDN (#173).
 * Reads the pre-computed membership analytics file.
 */
export const useMembershipHistory = (
  districtId: string | null,
  months: number = 12
) => {
  return useQuery<MembershipHistoryResponse, Error>({
    queryKey: ['membershipHistory', districtId, months],
    queryFn: async () => {
      if (!districtId) {
        throw new Error('District ID is required')
      }
      const { latestSnapshotDate } = await fetchCdnManifest()
      return fetchCdnDistrictAnalytics<MembershipHistoryResponse>(
        latestSnapshotDate,
        districtId,
        'membership'
      )
    },
    enabled: !!districtId,
    staleTime: 15 * 60 * 1000, // 15 minutes
    retry: 2,
  })
}
