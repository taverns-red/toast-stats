import { useQuery } from '@tanstack/react-query'
import {
  fetchCdnManifest,
  cdnAnalyticsUrl,
  fetchFromCdn,
} from '../services/cdn'

interface LeadershipEffectivenessScore {
  divisionId: string
  divisionName: string
  healthScore: number
  growthScore: number
  dcpScore: number
  overallScore: number
  rank: number
  isBestPractice: boolean
}

interface LeadershipChange {
  divisionId: string
  divisionName: string
  changeDate: string
  performanceBeforeChange: number
  performanceAfterChange: number
  performanceDelta: number
  trend: 'improved' | 'declined' | 'stable'
}

interface AreaDirectorCorrelation {
  areaId: string
  areaName: string
  divisionId: string
  clubPerformanceScore: number
  activityIndicator: 'high' | 'medium' | 'low'
  correlation: 'positive' | 'neutral' | 'negative'
}

export interface LeadershipInsights {
  leadershipScores: LeadershipEffectivenessScore[]
  bestPracticeDivisions: LeadershipEffectivenessScore[]
  leadershipChanges: LeadershipChange[]
  areaDirectorCorrelations: AreaDirectorCorrelation[]
  summary: {
    topPerformingDivisions: Array<{
      divisionId: string
      divisionName: string
      score: number
    }>
    topPerformingAreas: Array<{
      areaId: string
      areaName: string
      score: number
    }>
    averageLeadershipScore: number
    totalBestPracticeDivisions: number
  }
}

/**
 * API response structure from /leadership-insights endpoint
 * The actual LeadershipInsights data is nested under the 'insights' property
 */
interface LeadershipInsightsApiResponse {
  districtId: string
  dateRange: {
    start: string
    end: string
  }
  officerCompletionRate: number
  trainingCompletionRate: number
  leadershipEffectivenessScore: number
  topPerformingDivisions: unknown[]
  areasNeedingSupport: unknown[]
  insights: LeadershipInsights
}

/**
 * Hook to fetch leadership insights for a district
 */
export const useLeadershipInsights = (
  districtId: string | null,
  startDate?: string,
  endDate?: string
) => {
  return useQuery<LeadershipInsights, Error>({
    queryKey: ['leadershipInsights', districtId, startDate, endDate],
    queryFn: async () => {
      if (!districtId) {
        throw new Error('District ID is required')
      }

      // Fetch from CDN — pre-computed JSON
      const manifest = await fetchCdnManifest()
      const url = cdnAnalyticsUrl(
        manifest.latestSnapshotDate,
        districtId,
        'leadership-insights'
      )
      const file = await fetchFromCdn<{
        data: LeadershipInsightsApiResponse
      }>(url)
      return file.data.insights
    },
    enabled: !!districtId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  })
}
