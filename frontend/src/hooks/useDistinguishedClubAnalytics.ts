import { useQuery } from '@tanstack/react-query'
import {
  fetchCdnManifest,
  cdnAnalyticsUrl,
  fetchFromCdn,
} from '../services/cdn'

interface DCPGoalAnalysis {
  goalNumber: number
  achievementCount: number
  achievementPercentage: number
}

interface DistinguishedClubAchievement {
  clubId: string
  clubName: string
  level: 'President' | 'Select' | 'Distinguished'
  achievedDate: string
  goalsAchieved: number
}

export interface DistinguishedClubAnalytics {
  distinguishedClubs: {
    smedley: number
    presidents: number
    select: number
    distinguished: number
    total: number
  }
  distinguishedProjection: {
    smedley: number
    presidents: number
    select: number
    distinguished: number
    total: number
  }
  achievements: DistinguishedClubAchievement[]
  yearOverYearComparison?: {
    currentTotal: number
    previousTotal: number
    change: number
    percentageChange: number
    currentByLevel: {
      smedley: number
      presidents: number
      select: number
      distinguished: number
    }
    previousByLevel: {
      smedley: number
      presidents: number
      select: number
      distinguished: number
    }
  }
  dcpGoalAnalysis: {
    mostCommonlyAchieved: DCPGoalAnalysis[]
    leastCommonlyAchieved: DCPGoalAnalysis[]
  }
}

/**
 * Hook to fetch distinguished club analytics for a district
 */
export const useDistinguishedClubAnalytics = (
  districtId: string | null,
  startDate?: string,
  endDate?: string
) => {
  return useQuery<DistinguishedClubAnalytics, Error>({
    queryKey: ['distinguishedClubAnalytics', districtId, startDate, endDate],
    queryFn: async () => {
      if (!districtId) {
        throw new Error('District ID is required')
      }

      // Fetch from CDN — pre-computed JSON
      const manifest = await fetchCdnManifest()
      const url = cdnAnalyticsUrl(
        manifest.latestSnapshotDate,
        districtId,
        'distinguished-analytics'
      )
      const file = await fetchFromCdn<{ data: DistinguishedClubAnalytics }>(url)
      return file.data
    },
    enabled: !!districtId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  })
}
