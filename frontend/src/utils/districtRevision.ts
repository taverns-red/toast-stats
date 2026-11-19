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

/** What the header's revised note says and where it links (#2475). */
export interface DistrictRevisionLink {
  /** The date What Changed shows as the month end's "revised" date. */
  revisedOn: string
  /** What Changed `?from=` token: the district's previous version. */
  from: string
  /** What Changed `?to=` token: the month end as it stands now. */
  to: string
}

/** Stub (#2475 red step). */
export function districtRevisionLink(
  _index: ReconciliationRevisionIndex | null | undefined,
  _districtId: string,
  _monthEndCollectionDate?: string | null
): DistrictRevisionLink | null {
  return null
}
