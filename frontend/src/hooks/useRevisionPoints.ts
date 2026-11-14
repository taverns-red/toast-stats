import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  fetchCdnRevisionIndex,
  fetchCdnSnapshotCollectionDate,
} from '../services/cdn'
import type { SnapshotDate } from '../types/snapshotDate'
import {
  buildSnapshotPoints,
  isMonthEnd,
  type SnapshotPointSet,
} from '../utils/snapshotPoints'

/**
 * The points What Changed offers for a district: its dated snapshots plus the
 * month-end reconciliation revisions (#2475).
 *
 * One small fetch: the revision index of the most recent month end in the
 * district's dated list. Earlier month ends were final before revisions were
 * recorded, so probing them would only 404. A missing, failed or invalid index
 * is "no revisions" — the list is then exactly the dated snapshots, so the
 * page behaves as it did before this feature.
 */
export function useRevisionPoints(
  districtId: string | undefined,
  dates: readonly SnapshotDate[]
): SnapshotPointSet & { isLoading: boolean } {
  const monthEnd = useMemo(() => {
    for (let i = dates.length - 1; i >= 0; i--) {
      if (isMonthEnd(dates[i]!)) return dates[i]!
    }
    return undefined
  }, [dates])

  const { data: index, isLoading } = useQuery({
    queryKey: ['reconciliation-revision-index', monthEnd],
    queryFn: () => fetchCdnRevisionIndex(monthEnd!),
    enabled: !!monthEnd,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  // The newest revision is the plain month end only if the month end's
  // metadata says it was collected on that revision's asOf (#2814). Read it
  // once an index exists; unreadable or still loading counts as "not the same"
  // so nothing is ever aliased on a guess.
  const hasRevisions = !!index && index.revisions.length > 0
  const { data: collectionDate, isLoading: metaLoading } = useQuery({
    queryKey: ['reconciliation-month-end-collection-date', monthEnd],
    queryFn: () => fetchCdnSnapshotCollectionDate(monthEnd!),
    enabled: !!monthEnd && hasRevisions,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const set = useMemo(
    () =>
      buildSnapshotPoints(
        dates,
        index,
        districtId ?? '',
        hasRevisions ? (collectionDate ?? null) : undefined
      ),
    [dates, index, districtId, hasRevisions, collectionDate]
  )
  return { ...set, isLoading: isLoading || metaLoading }
}
