import { describe, it, expect } from 'vitest'
import type {
  DistrictStatisticsFile,
  PerDistrictData,
} from '@taverns-red/shared-contracts'
import {
  buildClubChangeFeed,
  pickFeedDates,
  reduceSnapshotToClub,
  type FeedPoint,
} from '../clubChangeFeed'
import recorded from '../../__tests__/fixtures/club-change-feed-d61.recorded.json'
import recordedIndex from '../../__tests__/fixtures/district-snapshot-index-d61.recorded.json'

/**
 * #2430 — the club page's "Recent changes" feed.
 *
 * Fixtures are REAL D61 snapshots from cdn.taverns.red, read 2026-11-01 and
 * reduced to two clubs (contact and address fields removed). Club 7238597
 * (90 Elgin Toastmasters) went 17 → 10 members across the October 1 dues
 * deadline; the D61 index has no snapshots for 2026-10-01..10-07 (a real gap).
 */
const SNAPS = recorded.snapshots as unknown as Record<string, PerDistrictData>
const ELGIN = '7238597'
const LIMESTONE = '3045'

function snap(date: string): DistrictStatisticsFile {
  const s = SNAPS[date]
  if (!s) throw new Error(`no fixture for ${date}`)
  // A deep copy, so a test can edit one without touching the others.
  return structuredClone(s.data)
}

function points(
  clubId: string,
  dates: string[],
  edit: (
    date: string,
    s: DistrictStatisticsFile
  ) => DistrictStatisticsFile | null = (_d, s) => s
): FeedPoint[] {
  return dates.map(date => {
    const edited = edit(date, snap(date))
    return {
      date,
      snapshot: edited ? reduceSnapshotToClub(edited, clubId) : null,
    }
  })
}

const WEEKLY = [
  '2026-09-23',
  '2026-09-30',
  '2026-10-08',
  '2026-10-15',
  '2026-10-22',
  '2026-10-31',
]

describe('pickFeedDates (#2430)', () => {
  const dates = recordedIndex.dates

  it('picks about one date a week across the last 90 days of the real D61 index, oldest first', () => {
    expect(pickFeedDates(dates, '2026-10-31')).toEqual([
      '2026-08-11',
      '2026-08-17',
      '2026-08-24',
      '2026-08-31',
      '2026-09-09',
      '2026-09-16',
      '2026-09-23',
      '2026-09-30',
      '2026-10-10',
      '2026-10-17',
      '2026-10-24',
      '2026-10-31',
    ])
  })

  it('bridges the real Oct 1–7 gap with the nearest earlier date', () => {
    const picked = pickFeedDates(dates, '2026-10-31')
    expect(picked).toContain('2026-09-30')
    expect(picked.some(d => d > '2026-09-30' && d < '2026-10-08')).toBe(false)
  })

  it('never reads past the page as-of date (R3)', () => {
    const picked = pickFeedDates(dates, '2026-09-30')
    expect(picked[picked.length - 1]).toBe('2026-09-30')
    expect(picked.every(d => d <= '2026-09-30')).toBe(true)
    expect(picked.every(d => d >= '2026-07-02')).toBe(true)
  })

  it('returns nothing when there are no dates in the window', () => {
    expect(pickFeedDates(dates, '2020-01-01')).toEqual([])
    expect(pickFeedDates([], '2026-10-31')).toEqual([])
  })
})

describe('reduceSnapshotToClub (#2430)', () => {
  it('keeps only the club’s own rows', () => {
    const reduced = reduceSnapshotToClub(snap('2026-10-31'), ELGIN)!
    expect(reduced.clubs.map(c => c.clubId)).toEqual([ELGIN])
    expect(reduced.clubPerformance).toHaveLength(1)
    expect(reduced.districtPerformance).toHaveLength(1)
    expect(reduced.snapshotDate).toBe('2026-10-31')
  })

  it('matches padded TI club numbers ("07238597")', () => {
    const reduced = reduceSnapshotToClub(snap('2026-10-31'), '07238597')!
    expect(reduced.clubs).toHaveLength(1)
  })

  it('is null when the club is not on the snapshot', () => {
    expect(reduceSnapshotToClub(snap('2026-10-31'), '99999999')).toBeNull()
  })
})

describe('buildClubChangeFeed (#2430)', () => {
  it('derives the dated events from a real weekly sequence, newest first', () => {
    const feed = buildClubChangeFeed(points(ELGIN, WEEKLY))
    expect(
      feed.entries.map(e => [e.fromDate, e.toDate, e.category, e.text])
    ).toEqual([
      ['2026-10-22', '2026-10-31', 'membership', 'Gained 1 member'],
      [
        '2026-10-22',
        '2026-10-31',
        'payments',
        'Recorded 1 new payment (1 October renewal)',
      ],
      ['2026-09-30', '2026-10-08', 'membership', 'Lost 7 members'],
      ['2026-09-23', '2026-09-30', 'dcp-goals', 'Met 1 more DCP goal'],
    ])
    expect(feed.totalEvents).toBe(4)
    expect(feed.truncated).toBe(false)
    expect(feed.unavailableDates).toEqual([])
    expect(feed.windowStart).toBe('2026-09-23')
    expect(feed.windowEnd).toBe('2026-10-31')
  })

  it('cites the October dues deadline only for a drop across it', () => {
    const feed = buildClubChangeFeed(points(ELGIN, WEEKLY))
    const drop = feed.entries.find(e => e.toDate === '2026-10-08')!
    expect(drop.reason?.text).toBe('Across the October 1 dues renewal deadline')
    expect(drop.reason?.source).toMatch(/Renewal-Dues/)
    expect(drop.reason?.source).toMatch(/Item 1111/)
    // A gain, a payment, a goal: no reason claimed.
    for (const e of feed.entries.filter(e => e !== drop)) {
      expect(e.reason).toBeUndefined()
    }
    expect(feed.hasReasons).toBe(true)
  })

  it('claims no reason for a drop that does not span a dues deadline', () => {
    const feed = buildClubChangeFeed(
      points(ELGIN, ['2026-10-15', '2026-10-22'], (date, s) => {
        if (date === '2026-10-22') s.clubs[0]!.membershipCount -= 2
        return s
      })
    )
    expect(feed.entries.map(e => e.text)).toEqual(['Lost 2 members'])
    expect(feed.entries[0]!.reason).toBeUndefined()
    expect(feed.hasReasons).toBe(false)
  })

  it('bridges an unavailable snapshot and reports it', () => {
    const feed = buildClubChangeFeed(
      points(ELGIN, WEEKLY, (date, s) => (date === '2026-10-08' ? null : s))
    )
    const drop = feed.entries.find(
      e => e.category === 'membership' && e.magnitude < 0
    )!
    expect([drop.fromDate, drop.toDate]).toEqual(['2026-09-30', '2026-10-15'])
    expect(drop.spansMissingData).toBe(true)
    expect(feed.unavailableDates).toEqual(['2026-10-08'])
    // The un-bridged windows are unaffected.
    expect(
      feed.entries.find(e => e.toDate === '2026-10-31')!.spansMissingData
    ).toBe(false)
  })

  it('treats a snapshot the club is missing from as a gap, not a closure and re-charter', () => {
    const feed = buildClubChangeFeed(
      points(LIMESTONE, WEEKLY, (date, s) => {
        if (date === '2026-10-15') {
          s.clubs = s.clubs.filter(c => c.clubId !== LIMESTONE)
        }
        return s
      })
    )
    expect(feed.entries.map(e => e.category)).not.toContain('club-removed')
    expect(feed.entries.map(e => e.category)).not.toContain('club-added')
    expect(feed.unavailableDates).toEqual(['2026-10-15'])
    expect(
      feed.entries.map(e => [e.fromDate, e.toDate, e.category, e.text])
    ).toEqual([
      ['2026-09-30', '2026-10-08', 'membership', 'Lost 5 members'],
      [
        '2026-09-30',
        '2026-10-08',
        'payments',
        'Recorded 1 new payment (1 October renewal)',
      ],
      [
        '2026-09-23',
        '2026-09-30',
        'payments',
        'Recorded 1 new payment (1 October renewal)',
      ],
    ])
  })

  it('skips leading unavailable dates and starts from the first usable one', () => {
    const feed = buildClubChangeFeed(
      points(ELGIN, WEEKLY, (date, s) => (date === '2026-09-23' ? null : s))
    )
    expect(feed.windowStart).toBe('2026-09-30')
    expect(feed.entries.map(e => e.category)).not.toContain('dcp-goals')
    expect(feed.unavailableDates).toEqual(['2026-09-23'])
  })

  it('has nothing to compare with fewer than two usable snapshots', () => {
    const feed = buildClubChangeFeed(
      points(ELGIN, WEEKLY, (date, s) => (date === '2026-10-31' ? s : null))
    )
    expect(feed.comparable).toBe(false)
    expect(feed.entries).toEqual([])
  })

  it('reports club operational-status changes through diffClubStatus', () => {
    const feed = buildClubChangeFeed(
      points(ELGIN, ['2026-10-22', '2026-10-31'], (date, s) => {
        if (date === '2026-10-31') s.clubs[0]!.clubStatus = 'Low'
        return s
      })
    )
    expect(feed.entries[0]).toMatchObject({
      category: 'club-status',
      text: 'Dropped to Low (was Active)',
    })
  })

  it('is bounded to the newest maxEvents, and says how many there were', () => {
    const feed = buildClubChangeFeed(points(ELGIN, WEEKLY), { maxEvents: 2 })
    expect(feed.entries).toHaveLength(2)
    expect(feed.entries.every(e => e.toDate === '2026-10-31')).toBe(true)
    expect(feed.totalEvents).toBe(4)
    expect(feed.truncated).toBe(true)
  })

  it('emits aggregates only — no member or contact data in any line', () => {
    const feed = buildClubChangeFeed(points(ELGIN, WEEKLY))
    for (const e of feed.entries) {
      expect(e.text).not.toMatch(/@|https?:|Elgin Street/)
    }
  })
})
