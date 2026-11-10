/* The analytics file's `distinguishedCounts` {confirmed, provisional} for one
   district on one date (#2601, slice of #2580). Reads through the shared
   analytics-file entry, so a page that already has the file pays nothing.
   `counts` is null while loading and for files written before #2553, which
   do not carry the field (ADR 0019): the caller falls back to rankings for
   confirmed and says "not recorded" for provisional. */

import { skipToken, useQuery } from '@tanstack/react-query'
import { districtAnalyticsFileQueryOptions } from './districtAnalyticsFileQuery'
import type { DistinguishedCountPair } from '../utils/distinguishedCounts'
import type { SnapshotDate } from '../types/snapshotDate'

export function useDistinguishedCountsAt(
  districtId: string | undefined,
  date: SnapshotDate | undefined
): { counts: DistinguishedCountPair | null; isLoading: boolean } {
  const { data, isLoading } = useQuery(
    districtId && date
      ? districtAnalyticsFileQueryOptions(districtId, date)
      : {
          queryKey: ['district-analytics-file', 'none'],
          queryFn: skipToken,
        }
  )
  return { counts: data?.distinguishedCounts ?? null, isLoading }
}
