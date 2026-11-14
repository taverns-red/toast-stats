import type { SnapshotDate } from '../types/snapshotDate'
import {
  buildSnapshotPoints,
  type SnapshotPointSet,
} from '../utils/snapshotPoints'

/**
 * The points What Changed offers for a district: its dated snapshots plus the
 * month-end reconciliation revisions (#2475).
 */
export function useRevisionPoints(
  districtId: string | undefined,
  dates: readonly SnapshotDate[]
): SnapshotPointSet & { isLoading: boolean } {
  return {
    ...buildSnapshotPoints(dates, null, districtId ?? ''),
    isLoading: false,
  }
}
