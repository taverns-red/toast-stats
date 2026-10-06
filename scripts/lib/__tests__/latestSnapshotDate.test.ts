import { describe, it, expect } from 'vitest'
import { resolveLatestSnapshotDate } from '../latestSnapshotDate.js'

// #1670: a rescrape-historical run for 2021-2022 leaves 2022-06-30 as its
// newest local snapshot. Staging v1/latest.json was moved back to it, and the
// club-index and divisions-areas-index steps followed it.
describe('resolveLatestSnapshotDate (#1670)', () => {
  const bucket = ['2022-06-30', '2026-10-04', '2026-10-05']

  it('never moves latest backwards for a historical run', () => {
    expect(
      resolveLatestSnapshotDate({
        localLatest: '2022-06-30',
        remoteLatest: '2026-10-05',
        bucketDates: bucket,
      })
    ).toBe('2026-10-05')
  })

  it('moves latest forward when this run produced a newer snapshot (daily)', () => {
    expect(
      resolveLatestSnapshotDate({
        localLatest: '2026-10-06',
        remoteLatest: '2026-10-05',
        bucketDates: [...bucket, '2026-10-06'],
      })
    ).toBe('2026-10-06')
  })

  it('ignores a remote latest whose snapshot is no longer in the bucket (pruned)', () => {
    expect(
      resolveLatestSnapshotDate({
        localLatest: '2026-09-30',
        remoteLatest: '2026-10-07',
        bucketDates: bucket,
      })
    ).toBe('2026-09-30')
  })

  it('falls back to the newest bucket date when nothing is local', () => {
    expect(
      resolveLatestSnapshotDate({
        remoteLatest: '2026-10-04',
        bucketDates: bucket,
      })
    ).toBe('2026-10-05')
  })

  it('uses the local date when the remote manifest is unreadable', () => {
    expect(
      resolveLatestSnapshotDate({ localLatest: '2026-10-05', bucketDates: [] })
    ).toBe('2026-10-05')
  })

  it('returns undefined when there is no date anywhere', () => {
    expect(resolveLatestSnapshotDate({ bucketDates: [] })).toBeUndefined()
  })

  it('ignores malformed values', () => {
    expect(
      resolveLatestSnapshotDate({
        localLatest: 'null',
        remoteLatest: 'null',
        bucketDates: ['', 'snapshots', '2026-10-05'],
      })
    ).toBe('2026-10-05')
  })
})
