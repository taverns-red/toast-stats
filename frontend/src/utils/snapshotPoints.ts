import type { ReconciliationRevisionIndex } from '@taverns-red/shared-contracts'
import type { SnapshotDate } from '../types/snapshotDate'

/**
 * A point What Changed can diff: a dated snapshot, or one month-end
 * reconciliation revision of it (#2475).
 */
export interface SnapshotPoint {
  date: SnapshotDate
  asOf?: string
}

export interface SnapshotPointSet {
  points: SnapshotPoint[]
  /** token -> display label */
  labels: Record<string, string>
  /** token -> optgroup heading, only for month ends that have revisions */
  groups: Record<string, string>
  /** URL token that is another spelling of a listed token -> that token */
  aliases: Record<string, string>
}

export function pointToken(_point: SnapshotPoint): string {
  throw new Error('not implemented')
}

export function buildSnapshotPoints(
  _dates: readonly SnapshotDate[],
  _index: ReconciliationRevisionIndex | null | undefined,
  _districtId: string
): SnapshotPointSet {
  throw new Error('not implemented')
}
