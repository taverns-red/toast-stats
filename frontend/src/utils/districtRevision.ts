import type { ReconciliationRevisionIndex } from '@taverns-red/shared-contracts'

/**
 * The date of the newest reconciliation revision that holds `districtId`, or
 * null when the district has none for this month end (#2475).
 */
export function districtRevisedAsOf(
  _index: ReconciliationRevisionIndex | null | undefined,
  _districtId: string
): string | null {
  return null
}
