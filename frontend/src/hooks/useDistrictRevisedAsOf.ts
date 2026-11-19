import { useQuery } from '@tanstack/react-query'
import { fetchCdnRevisionIndex } from '../services/cdn'
import { districtRevisedAsOf } from '../utils/districtRevision'
import { isMonthEnd } from '../utils/snapshotPoints'

/**
 * The date of this district's newest reconciliation revision for the month end
 * on screen, or null (#2475).
 *
 * Only a month end can have revisions, so any other viewed date fetches
 * nothing. It shares the query key with `useRevisionPoints`, so on the What
 * Changed page the index is fetched once. A missing or invalid index reads as
 * "no revision".
 */
export function useDistrictRevisedAsOf(
  districtId: string,
  viewedDate: string | undefined
): string | null {
  const monthEnd = viewedDate && isMonthEnd(viewedDate) ? viewedDate : undefined
  const { data: index } = useQuery({
    queryKey: ['reconciliation-revision-index', monthEnd],
    queryFn: () => fetchCdnRevisionIndex(monthEnd!),
    enabled: !!monthEnd,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  return districtRevisedAsOf(index, districtId)
}
