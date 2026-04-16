import { useQuery } from '@tanstack/react-query'
import {
  fetchCdnCompetitiveAwards,
  type CompetitiveAwardStandings,
} from '../services/cdn'

/**
 * React Query hook for fetching competitive award standings (#330).
 *
 * Returns null when the snapshot does not have a competitive-awards.json
 * file (legacy snapshots predating #330).
 */
export function useCompetitiveAwards(date: string | undefined) {
  return useQuery<CompetitiveAwardStandings | null>({
    queryKey: ['competitive-awards', date],
    queryFn: () => {
      if (!date) return Promise.resolve(null)
      return fetchCdnCompetitiveAwards(date)
    },
    enabled: !!date,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}
