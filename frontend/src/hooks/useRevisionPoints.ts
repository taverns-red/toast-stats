import { useMemo } from 'react'
import type { SnapshotDate } from '../types/snapshotDate'
import {
  buildSnapshotPoints,
  isMonthEnd,
  type SnapshotPointSet,
} from '../utils/snapshotPoints'
import { useMonthEndRevisions } from './useMonthEndRevisions'

/**
 * The points What Changed offers for a district: its dated snapshots plus the
 * month-end reconciliation revisions (#2475).
 *
 * One small fetch: the revision index of the most recent month end in the
 * district's dated list. Earlier month ends were final before revisions were
 * recorded, so probing them would only 404. A missing, failed or invalid index
 * is "no revisions" — the list is then exactly the dated snapshots, so the
 * page behaves as it did before this feature.
 *
 * The newest revision is the plain month end only if the month end's metadata
 * says it was collected on that revision's asOf (#2814); see
 * `useMonthEndRevisions` for how that read is passed on.
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

  const { index, collectionDate, isLoading } = useMonthEndRevisions(monthEnd)

  const set = useMemo(
    () => buildSnapshotPoints(dates, index, districtId ?? '', collectionDate),
    [dates, index, districtId, collectionDate]
  )
  return { ...set, isLoading }
}
