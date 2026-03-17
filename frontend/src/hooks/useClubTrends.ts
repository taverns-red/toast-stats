import { useQuery } from '@tanstack/react-query'
import type { ClubHealthStatus } from '@toastmasters/shared-contracts'
import { apiClient } from '../services/api'

// Re-export for backward compatibility with existing imports
export type { ClubHealthStatus }

/**
 * Interface for club trend data
 */
export interface ClubTrend {
  clubId: string
  clubName: string
  divisionId: string
  divisionName: string
  areaId: string
  areaName: string
  membershipTrend: Array<{ date: string; count: number }>
  dcpGoalsTrend: Array<{ date: string; goalsAchieved: number }>
  membershipBase?: number
  currentStatus: ClubHealthStatus
  riskFactors: string[]
  distinguishedLevel?: 'President' | 'Select' | 'Distinguished'
}

/**
 * Hook to fetch club-specific trend data
 * Retrieves membership trends, DCP goal progress, and risk assessment for a specific club
 *
 * @param districtId - The district ID the club belongs to
 * @param clubId - The club ID to fetch trends for
 * @param enabled - Whether the query should be enabled (default: true)
 * @returns Query result with club trend data
 *
 * Requirements: 3.1, 3.2, 4.4
 */
export const useClubTrends = (
  districtId: string | null,
  clubId: string | null,
  enabled: boolean = true
) => {
  return useQuery<ClubTrend, Error>({
    queryKey: ['clubTrends', districtId, clubId],
    queryFn: async () => {
      if (!districtId || !clubId) {
        throw new Error('District ID and club ID are required')
      }

      const response = await apiClient.get<ClubTrend>(
        `/districts/${districtId}/clubs/${clubId}/trends`
      )
      return response.data
    },
    enabled: enabled && !!districtId && !!clubId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  })
}

/**
 * Hook to fetch vulnerable clubs for a district
 * Returns list of clubs that are vulnerable or intervention-required based on various factors
 *
 * @param districtId - The district ID to fetch vulnerable clubs for
 * @param enabled - Whether the query should be enabled (default: true)
 * @returns Query result with vulnerable clubs data
 *
 * Requirements: 3.2, 3.3
 */
export const useVulnerableClubs = (
  districtId: string | null,
  enabled: boolean = true
) => {
  return useQuery<
    {
      districtId: string
      totalVulnerableClubs: number
      interventionRequiredClubs: number
      vulnerableClubs: number
      clubs: ClubTrend[]
    },
    Error
  >({
    queryKey: ['vulnerableClubs', districtId],
    queryFn: async () => {
      if (!districtId) {
        throw new Error('District ID is required')
      }

      const response = await apiClient.get(
        `/districts/${districtId}/vulnerable-clubs`
      )
      return response.data
    },
    enabled: enabled && !!districtId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  })
}
