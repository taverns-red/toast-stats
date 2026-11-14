import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { fetchCdnRevisionIndex } from '../services/cdn'
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

  const set = useMemo(
    () => buildSnapshotPoints(dates, index, districtId ?? ''),
    [dates, index, districtId]
  )
  return { ...set, isLoading }
}
