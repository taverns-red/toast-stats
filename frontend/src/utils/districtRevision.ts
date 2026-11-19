import type { ReconciliationRevisionIndex } from '@taverns-red/shared-contracts'

/**
 * The date of the newest reconciliation revision that holds `districtId`, or
 * null when the district has none for this month end (#2475).
 *
 * Revision 0 (`closing: false`) is the in-month view, not a revision, so it
 * never counts. A revision that lacks the district (#1671 gap) is skipped, so
 * the label never names a day this district's data did not change on.
 */
export function districtRevisedAsOf(
  index: ReconciliationRevisionIndex | null | undefined,
  districtId: string
): string | null {
  if (!index) return null
  for (let i = index.revisions.length - 1; i >= 0; i--) {
    const r = index.revisions[i]!
    if (r.closing && r.successfulDistricts.includes(districtId)) return r.asOf
  }
  return null
}
