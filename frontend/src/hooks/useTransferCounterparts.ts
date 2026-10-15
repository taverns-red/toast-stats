import type { SnapshotDiff } from '@taverns-red/shared-contracts'

export function useTransferCounterparts(
  _diff: Pick<SnapshotDiff, 'events' | 'rosterDiscontinuity'> | undefined,
  _districtId: string
): ReadonlyMap<string, string> {
  return new Map()
}
