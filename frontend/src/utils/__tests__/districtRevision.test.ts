import { describe, it, expect } from 'vitest'
import type { ReconciliationRevisionIndex } from '@taverns-red/shared-contracts'
import { districtRevisedAsOf } from '../districtRevision'

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

describe('districtRevisedAsOf (#2475)', () => {
  it('returns the newest closing revision that holds the district', () => {
    const idx = index([
      { asOf: '2026-11-02', closing: true, districts: ['61', 'F'] },
      { asOf: '2026-11-03', closing: true, districts: ['61'] },
    ])
    expect(districtRevisedAsOf(idx, '61')).toBe('2026-11-03')
    expect(districtRevisedAsOf(idx, 'F')).toBe('2026-11-02')
  })

  it('returns null for a district no revision holds', () => {
    const idx = index([
      { asOf: '2026-11-02', closing: true, districts: ['61'] },
    ])
    expect(districtRevisedAsOf(idx, '99')).toBeNull()
  })

  it('does not count revision 0, the pre-close view, as a revision', () => {
    const idx = index([
      { asOf: '2026-10-31', closing: false, districts: ['61'] },
    ])
    expect(districtRevisedAsOf(idx, '61')).toBeNull()
  })

  it('returns null with no index', () => {
    expect(districtRevisedAsOf(null, '61')).toBeNull()
    expect(districtRevisedAsOf(undefined, '61')).toBeNull()
  })
})
