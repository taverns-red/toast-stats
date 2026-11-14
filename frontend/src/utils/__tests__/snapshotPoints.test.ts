import { describe, it, expect } from 'vitest'
import type { ReconciliationRevisionIndex } from '@taverns-red/shared-contracts'
import { snap } from '../../test-utils/snapshotDate'
import { buildSnapshotPoints, pointToken } from '../snapshotPoints'

/* #2475 phase 1 — What Changed lists month-end reconciliation revisions.
   The date list becomes points {date, asOf?}: a revision point is
   (monthEnd, asOf). The newest revision IS snapshots/<monthEnd>/, so it stays
   the plain month-end point; only EARLIER revisions are extra points. */

const DATES = ['2026-10-29', '2026-10-30', '2026-10-31'].map(snap)

const rev = (asOf: string, closing = true, districts = ['61', '05']) => ({
  asOf,
  collectedAt: `${asOf}T10:00:00.000Z`,
  closing,
  successfulDistricts: districts,
})

const index = (
  revisions: ReconciliationRevisionIndex['revisions']
): ReconciliationRevisionIndex => ({
  schemaVersion: 1,
  monthEnd: '2026-10-31',
  dataMonth: '2026-10',
  revisions,
  final: null,
})

const tokens = (set: ReturnType<typeof buildSnapshotPoints>) =>
  set.points.map(pointToken)

describe('pointToken', () => {
  it('is the bare date for a dated point and date@asOf for a revision', () => {
    expect(pointToken({ date: snap('2026-10-31') })).toBe('2026-10-31')
    expect(pointToken({ date: snap('2026-10-31'), asOf: '2026-11-02' })).toBe(
      '2026-10-31@2026-11-02'
    )
  })
})

describe('buildSnapshotPoints', () => {
  it('with no index returns exactly the dated points, unchanged', () => {
    const set = buildSnapshotPoints(DATES, null, '61')
    expect(tokens(set)).toEqual(DATES)
    expect(set.points.every(p => p.asOf === undefined)).toBe(true)
    expect(set.aliases).toEqual({})
    expect(set.groups).toEqual({})
  })

  it('a single closing revision adds no point: it is the plain month end, relabelled', () => {
    const set = buildSnapshotPoints(DATES, index([rev('2026-11-02')]), '61')
    expect(tokens(set)).toEqual(DATES)
    expect(set.labels['2026-10-31']).toBe('Oct 31, 2026 · revised Nov 2')
    // The same revision spelled with its asOf resolves to the plain point.
    expect(set.aliases['2026-10-31@2026-11-02']).toBe('2026-10-31')
  })

  it('earlier revisions become points before the plain month end, oldest first', () => {
    const set = buildSnapshotPoints(
      DATES,
      index([rev('2026-10-31', false), rev('2026-11-02'), rev('2026-11-03')]),
      '61'
    )
    expect(tokens(set)).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-10-31@2026-10-31',
      '2026-10-31@2026-11-02',
      '2026-10-31',
    ])
    expect(set.labels['2026-10-31@2026-10-31']).toBe(
      'Oct 31, 2026 · first view'
    )
    expect(set.labels['2026-10-31@2026-11-02']).toBe(
      'Oct 31, 2026 · revised Nov 2'
    )
    expect(set.labels['2026-10-31']).toBe('Oct 31, 2026 · revised Nov 3')
    expect(set.aliases['2026-10-31@2026-11-03']).toBe('2026-10-31')
  })

  it('groups a month end and its revisions under one heading', () => {
    const set = buildSnapshotPoints(
      DATES,
      index([rev('2026-11-02'), rev('2026-11-03')]),
      '61'
    )
    expect(set.groups['2026-10-31@2026-11-02']).toBe('Oct 31, 2026 revisions')
    expect(set.groups['2026-10-31']).toBe('Oct 31, 2026 revisions')
    expect(set.groups['2026-10-30']).toBeUndefined()
  })

  it('leaves out an earlier revision that lacks this district (#1671 gap)', () => {
    const set = buildSnapshotPoints(
      DATES,
      index([rev('2026-11-02', true, ['05']), rev('2026-11-03')]),
      '61'
    )
    expect(tokens(set)).toEqual(DATES)
  })

  it('ignores an index whose month end is not in the date list', () => {
    const set = buildSnapshotPoints(
      [snap('2026-09-30'), snap('2026-10-30')],
      index([rev('2026-11-02'), rev('2026-11-03')]),
      '61'
    )
    expect(tokens(set)).toEqual(['2026-09-30', '2026-10-30'])
  })
})

/* #2814 — the newest revision is the plain month end ONLY when
   snapshots/<monthEnd>/metadata.json `collectionDate` equals the index's latest
   `asOf`. If the collector refused a closing run (warn only), the month end holds
   newer data than the index records, and aliasing would serve it under the
   older label. */
describe('buildSnapshotPoints — alias guard (#2814)', () => {
  const two = index([rev('2026-11-02'), rev('2026-11-03')])

  it('keeps the alias when the month end collectionDate equals the latest asOf', () => {
    const set = buildSnapshotPoints(DATES, two, '61', '2026-11-03')
    expect(tokens(set)).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-10-31@2026-11-02',
      '2026-10-31',
    ])
    expect(set.aliases['2026-10-31@2026-11-03']).toBe('2026-10-31')
    expect(set.labels['2026-10-31']).toBe('Oct 31, 2026 · revised Nov 3')
  })

  it('does not alias when the month end holds newer data than the latest asOf', () => {
    const set = buildSnapshotPoints(DATES, two, '61', '2026-11-04')
    expect(set.aliases).toEqual({})
    expect(tokens(set)).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-10-31@2026-11-02',
      '2026-10-31@2026-11-03',
      '2026-10-31',
    ])
    expect(set.labels['2026-10-31@2026-11-03']).toBe(
      'Oct 31, 2026 · revised Nov 3'
    )
    // The plain month end is its own, newer point, labelled with its own date.
    expect(set.labels['2026-10-31']).toBe('Oct 31, 2026 · revised Nov 4')
    expect(set.groups['2026-10-31@2026-11-03']).toBe('Oct 31, 2026 revisions')
    expect(set.groups['2026-10-31']).toBe('Oct 31, 2026 revisions')
  })

  it('does not alias when the month end collectionDate is unknown', () => {
    const set = buildSnapshotPoints(DATES, two, '61', null)
    expect(set.aliases).toEqual({})
    expect(tokens(set)).toContain('2026-10-31@2026-11-03')
    expect(set.labels['2026-10-31']).toBeUndefined()
  })

  it('a single revision that is not the month end is its own point too', () => {
    const set = buildSnapshotPoints(
      DATES,
      index([rev('2026-11-02')]),
      '61',
      '2026-11-04'
    )
    expect(set.aliases).toEqual({})
    expect(tokens(set)).toContain('2026-10-31@2026-11-02')
  })
})
