import { describe, it, expect } from 'vitest'
import type { ReconciliationRevisionIndex } from '@taverns-red/shared-contracts'
import { districtRevisionLink } from '../districtRevision'

const index = (
  revisions: Array<{ asOf: string; closing: boolean; districts: string[] }>
): ReconciliationRevisionIndex => ({
  schemaVersion: 1,
  monthEnd: '2026-10-31',
  dataMonth: '2026-10',
  final: null,
  revisions: revisions.map(r => ({
    asOf: r.asOf,
    closing: r.closing,
    collectedAt: `${r.asOf}T12:00:00.000Z`,
    successfulDistricts: r.districts,
  })),
})

describe('districtRevisionLink (#2475)', () => {
  const idx = index([
    { asOf: '2026-10-31', closing: false, districts: ['61', 'F'] },
    { asOf: '2026-11-02', closing: true, districts: ['61'] },
    { asOf: '2026-11-03', closing: true, districts: ['61', 'F'] },
  ])

  it('returns null for a district no revision holds', () => {
    expect(districtRevisionLink(idx, '99', '2026-11-03')).toBeNull()
  })

  it('opens the diff from the previous revision to the month end as it stands', () => {
    expect(districtRevisionLink(idx, '61', '2026-11-03')).toEqual({
      revisedOn: '2026-11-03',
      from: '2026-10-31@2026-11-02',
      to: '2026-10-31',
    })
  })

  it("skips a revision that lacks the district, as What Changed's list does", () => {
    expect(districtRevisionLink(idx, 'F', '2026-11-03')).toEqual({
      revisedOn: '2026-11-03',
      from: '2026-10-31@2026-10-31',
      to: '2026-10-31',
    })
  })

  it('dates a refused later run by the month end collection date, as What Changed does', () => {
    // The collector refused a closing run on Nov 5, so the month end holds
    // newer data than the index records. What Changed labels the month end
    // "revised Nov 5" and lists the Nov 3 revision as its own point.
    expect(districtRevisionLink(idx, '61', '2026-11-05')).toEqual({
      revisedOn: '2026-11-05',
      from: '2026-10-31@2026-11-03',
      to: '2026-10-31',
    })
  })

  it('returns null while the collection date is unreadable, as What Changed shows no date', () => {
    expect(districtRevisionLink(idx, '61', null)).toBeNull()
  })

  it('returns null with only the pre-close view', () => {
    const only0 = index([
      { asOf: '2026-10-31', closing: false, districts: ['61'] },
    ])
    expect(districtRevisionLink(only0, '61', '2026-10-31')).toBeNull()
  })

  it('returns null when the district has no earlier version to compare', () => {
    const lone = index([
      { asOf: '2026-11-03', closing: true, districts: ['61'] },
    ])
    expect(districtRevisionLink(lone, '61', '2026-11-03')).toBeNull()
  })

  it('returns null with no index', () => {
    expect(districtRevisionLink(null, '61', null)).toBeNull()
    expect(districtRevisionLink(undefined, '61', null)).toBeNull()
  })
})
