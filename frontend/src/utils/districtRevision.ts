import type { ReconciliationRevisionIndex } from '@taverns-red/shared-contracts'
import { toSnapshotDate } from '../types/snapshotDate'
import {
  buildSnapshotPoints,
  monthEndRevisedOn,
  pointToken,
} from './snapshotPoints'

/** What the header's revised note says and where it links (#2475). */
export interface DistrictRevisionLink {
  /** The date What Changed shows as the month end's "revised" date. */
  revisedOn: string
  /** What Changed `?from=` token: the district's previous version. */
  from: string
  /** What Changed `?to=` token: the month end as it stands now. */
  to: string
}

/**
 * Where the header's revised note points: What Changed from the district's
 * previous version of the month end to the month end as it stands (#2475).
 *
 * Both the date and the points come from the helpers the What Changed picker
 * uses (`monthEndRevisedOn`, `buildSnapshotPoints`), so the note names the
 * same date that page shows and `from` is always a token it accepts. A
 * revision that lacks the district (#1671 gap) is not a point for it. Null
 * when the month end carries no revised date, or the district has no earlier
 * version to compare against.
 */
export function districtRevisionLink(
  index: ReconciliationRevisionIndex | null | undefined,
  districtId: string,
  monthEndCollectionDate?: string | null
): DistrictRevisionLink | null {
  const revisedOn = monthEndRevisedOn(index, monthEndCollectionDate)
  const monthEnd = toSnapshotDate(index?.monthEnd)
  if (!index || !revisedOn || !monthEnd) return null
  const { points } = buildSnapshotPoints(
    [monthEnd],
    index,
    districtId,
    monthEndCollectionDate
  )
  const previous = points[points.length - 2]
  if (!previous) return null
  return { revisedOn, from: pointToken(previous), to: monthEnd }
}
