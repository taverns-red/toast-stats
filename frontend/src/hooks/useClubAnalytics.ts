import { useQuery } from '@tanstack/react-query'
import type { DistrictReportsDataset } from '@taverns-red/shared-contracts'
import type { ClubTrend } from './useDistrictAnalytics'
import type { SnapshotDate } from '../types/snapshotDate'

/** #1901 — stub for the red commit; the next commit implements it. */
export interface ClubAnalytics {
  club: ClubTrend | null
  districtReports: DistrictReportsDataset | null
  source: 'shard' | 'district'
}

export const useClubAnalytics = (
  districtId: string | null,
  clubId: string | null,
  _startDate?: string,
  _endDate?: SnapshotDate,
  _options: { enabled?: boolean } = {}
) =>
  useQuery<ClubAnalytics, Error>({
    queryKey: ['clubAnalytics', districtId, clubId],
    queryFn: async () => ({
      club: null,
      districtReports: null,
      source: 'district',
    }),
  })
