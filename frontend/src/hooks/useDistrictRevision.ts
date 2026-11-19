import { useMemo } from 'react'
import {
  districtRevisionLink,
  type DistrictRevisionLink,
} from '../utils/districtRevision'
import { toSnapshotDate } from '../types/snapshotDate'
import { useMonthEndRevisions } from './useMonthEndRevisions'

/**
 * The header's revised note for `districtId` on `monthEnd`, or null (#2475).
 *
 * Pass `monthEnd` only when it is the newest month end, the one What Changed
 * offers revisions for; undefined fetches nothing. The reads are the same
 * cached queries What Changed uses, so on that page they are fetched once.
 * A missing or invalid index reads as "no revision".
 */
export function useDistrictRevision(
  districtId: string,
  monthEnd: string | undefined
): DistrictRevisionLink | null {
  const { index, collectionDate } = useMonthEndRevisions(
    toSnapshotDate(monthEnd)
  )
  return useMemo(
    () => districtRevisionLink(index, districtId, collectionDate),
    [index, districtId, collectionDate]
  )
}
