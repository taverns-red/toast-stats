import { describe, expect, it } from 'vitest'

import {
  RECONCILIATION_REVISIONS_DIR,
  RECONCILIATION_REVISION_INDEX_FILE_NAME,
  ReconciliationRevisionIndexSchema,
  isReconciliationRevisionObject,
  reconciliationRevisionDistrictPath,
  reconciliationRevisionIndexPath,
  type ReconciliationRevisionIndex,
} from '../index.js'

/**
 * #2475 phase 1 — `snapshots/<monthEnd>/revisions/index.json`, the record
 * of every month-end reconciliation revision TI served for a closing month.
 * `snapshots/<monthEnd>/` itself stays the newest (eventually final) close;
 * each revision is a write-once copy of its district files under
 * `revisions/<asOf>/`, where `asOf` is the collection date.
 */

const index = (
  over: Partial<ReconciliationRevisionIndex> = {}
): ReconciliationRevisionIndex => ({
  schemaVersion: 1,
  monthEnd: '2026-10-31',
  dataMonth: '2026-10',
  revisions: [
    {
      asOf: '2026-10-31',
      collectedAt: '2026-10-31T13:05:00.000Z',
      closing: false,
      successfulDistricts: ['61', 'F'],
    },
    {
      asOf: '2026-11-01',
      collectedAt: '2026-11-01T13:05:00.000Z',
      closing: true,
      successfulDistricts: ['61', 'F'],
    },
  ],
  final: null,
  ...over,
})

describe('ReconciliationRevisionIndexSchema (#2475)', () => {
  it('accepts revision 0 followed by closing revisions in as-of order', () => {
    expect(ReconciliationRevisionIndexSchema.safeParse(index()).success).toBe(
      true
    )
  })

  it('accepts an index with no revision 0 (the feature started mid-close)', () => {
    const r = ReconciliationRevisionIndexSchema.safeParse(
      index({ revisions: index().revisions.slice(1) })
    )
    expect(r.success).toBe(true)
  })

  it('rejects revisions out of as-of order or repeated', () => {
    const [r0, r1] = index().revisions
    for (const revisions of [
      [r1!, r0!],
      [r1!, r1!],
    ]) {
      expect(
        ReconciliationRevisionIndexSchema.safeParse(index({ revisions }))
          .success
      ).toBe(false)
    }
  })

  it('rejects a monthEnd that is not the last day of its month', () => {
    expect(
      ReconciliationRevisionIndexSchema.safeParse(
        index({ monthEnd: '2026-10-30' })
      ).success
    ).toBe(false)
  })

  it('rejects a dataMonth that disagrees with monthEnd', () => {
    expect(
      ReconciliationRevisionIndexSchema.safeParse(
        index({ dataMonth: '2026-09' })
      ).success
    ).toBe(false)
  })

  it('revision 0 is the month end itself; a closing revision is after it', () => {
    const [r0, r1] = index().revisions
    expect(
      ReconciliationRevisionIndexSchema.safeParse(
        index({ revisions: [{ ...r0!, asOf: '2026-10-30' }, r1!] })
      ).success
    ).toBe(false)
    expect(
      ReconciliationRevisionIndexSchema.safeParse(
        index({ revisions: [r0!, { ...r1!, asOf: '2026-10-31' }] })
      ).success
    ).toBe(false)
  })

  it('final, when set, names a listed revision', () => {
    expect(
      ReconciliationRevisionIndexSchema.safeParse(
        index({ final: '2026-11-01' })
      ).success
    ).toBe(true)
    expect(
      ReconciliationRevisionIndexSchema.safeParse(
        index({ final: '2026-11-05' })
      ).success
    ).toBe(false)
  })

  it('is a tolerant reader: an unknown key does not break it', () => {
    expect(
      ReconciliationRevisionIndexSchema.safeParse({ ...index(), later: 1 })
        .success
    ).toBe(true)
  })
})

describe('reconciliation revision paths (#2475)', () => {
  it('names the index and the district files under the month end', () => {
    expect(RECONCILIATION_REVISIONS_DIR).toBe('revisions')
    expect(RECONCILIATION_REVISION_INDEX_FILE_NAME).toBe('index.json')
    expect(reconciliationRevisionIndexPath('2026-10-31')).toBe(
      'snapshots/2026-10-31/revisions/index.json'
    )
    expect(
      reconciliationRevisionDistrictPath('2026-10-31', '2026-11-02', '61')
    ).toBe('snapshots/2026-10-31/revisions/2026-11-02/district_61.json')
  })

  it('recognises revision objects by their name under snapshots/<date>/', () => {
    expect(isReconciliationRevisionObject('revisions/index.json')).toBe(true)
    expect(
      isReconciliationRevisionObject('revisions/2026-11-02/district_61.json')
    ).toBe(true)
    for (const name of [
      'district_61.json',
      'analytics/district_61_analytics.json',
      'metadata.json',
      'revisionsX/index.json',
    ]) {
      expect(isReconciliationRevisionObject(name)).toBe(false)
    }
  })
})
