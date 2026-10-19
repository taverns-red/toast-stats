import { describe, it, expect } from 'vitest'
import type { ClubDistrictHistoryClub } from '@taverns-red/shared-contracts'
import { buildClubLifecycle } from '../clubLifecycle'
import shard77Exact from '../../__tests__/fixtures/club-district-history-77-change-points.fold.json'

/**
 * #2169 — the history starts where our data starts (2016–17 for most
 * districts), so its first span is NOT when the club joined the district:
 * there is no "First record in District N" row. A district row appears only
 * for a move the history observed ("Moved from District Y to District X"),
 * and a charter before the district's earliest snapshot gets a note saying
 * where our records start (`recordsStart`).
 *
 * #1843 — the club page's Lifecycle panel is a vertical timeline (mobile
 * review §6.3, feature design §3.2). Its events come from data already on the
 * CDN: the snapshot's `charterDate`, the club-district history shard
 * (`config/club-district-history/NN.json`, #1782) and, for a suspended club,
 * the date's `suspended-clubs.json` (#1953).
 *
 * Fixtures are recorded from cdn.taverns.red on 2026-10-15 (asOf 2026-10-13),
 * trimmed to the fields the schema carries.
 */

// Shard 77, club 977 — District 01 until the 2026 reformation, then D201.
const CLUB_977: ClubDistrictHistoryClub = {
  name: 'Professional Women Toastmasters',
  formerNames: [],
  firstSeen: '2017-01-31',
  lastSeen: '2026-10-13',
  spans: [
    { from: '2017-01-31', to: '2026-06-30', districtId: '01' },
    { from: '2026-07-26', to: null, districtId: '201' },
  ],
  byProgramYear: { '2025-2026': '01', '2026-2027': '201' },
}

// Shard 97, club 7238597 (the D61 smoke club) — first seen before its
// recorded charter date; never moved.
const CLUB_7238597: ClubDistrictHistoryClub = {
  name: '90 Elgin Toastmasters',
  formerNames: [],
  firstSeen: '2018-07-31',
  lastSeen: '2026-10-13',
  spans: [{ from: '2018-07-31', to: null, districtId: '61' }],
  byProgramYear: { '2018-2019': '61', '2026-2027': '61' },
}

// Shard 97, club 6197 — two moves (72 → 112 → 72).
const CLUB_6197: ClubDistrictHistoryClub = {
  name: 'Mt. Albert Club',
  formerNames: [],
  firstSeen: '2017-01-31',
  lastSeen: '2026-10-13',
  spans: [
    { from: '2017-01-31', to: '2018-06-30', districtId: '72' },
    { from: '2018-07-31', to: '2026-06-30', districtId: '112' },
    { from: '2026-07-26', to: null, districtId: '72' },
  ],
  byProgramYear: { '2017-2018': '72', '2018-2019': '112', '2026-2027': '72' },
}

// Shard 97, club 1597 — last seen in March 2019 (closed).
const CLUB_1597: ClubDistrictHistoryClub = {
  name: 'WRIP City Club',
  formerNames: [],
  firstSeen: '2017-01-31',
  lastSeen: '2019-03-31',
  spans: [{ from: '2017-01-31', to: '2019-03-31', districtId: '07' }],
  byProgramYear: { '2016-2017': '07', '2018-2019': '07' },
}

// Shard 97, club 497 — renamed, and moved 10 → 219.
const CLUB_497: ClubDistrictHistoryClub = {
  name: 'Westlake Toastmasters #497',
  formerNames: ['Westlake Toastmasters Club'],
  firstSeen: '2017-01-31',
  lastSeen: '2026-10-13',
  spans: [
    { from: '2017-01-31', to: '2026-06-30', districtId: '10' },
    { from: '2026-07-26', to: null, districtId: '219' },
  ],
  byProgramYear: { '2025-2026': '10', '2026-2027': '219' },
}

// The fold's output on recorded club-race stores of the 2026 reformation
// (#1816): the move is dated to the day.
const CLUB_977_EXACT = shard77Exact.clubs['977'] as ClubDistrictHistoryClub

// Shard 93, club 5193 (cdn.taverns.red, asOf 2026-10-18): D80 since our
// data began, chartered Oct 2000. D80's earliest snapshot is 2017-01-31.
const CLUB_5193: ClubDistrictHistoryClub = {
  name: 'Ang Mo Kio C.C. Mandarin Toastmasters Club',
  formerNames: [],
  firstSeen: '2017-01-31',
  lastSeen: '2026-10-18',
  spans: [{ from: '2017-01-31', to: null, districtId: '80' }],
  byProgramYear: { '2016-2017': '80', '2026-2027': '80' },
}

const rows = (r: ReturnType<typeof buildClubLifecycle>) =>
  r.events.map(e => [e.title, e.when])

describe('buildClubLifecycle', () => {
  describe('no "First record in District N" row (#2169)', () => {
    it('a club that predates our data: charter, current district, records-start note (club 5193)', () => {
      const r = buildClubLifecycle({
        charterDate: '2000-10-12',
        history: CLUB_5193,
        recordsStartDate: '2017-01-31',
      })
      expect(rows(r)).toEqual([
        ['Chartered', 'Oct 2000'],
        ['In District 80', ''],
      ])
      expect(r.events.map(e => e.current)).toEqual([false, true])
      expect(r.recordsStart).toBe('2016–17')
      expect(r.events.some(e => /First record/.test(e.title))).toBe(false)
    })

    it('a club chartered inside our data window: charter plus current state, no note (club 7238597)', () => {
      const r = buildClubLifecycle({
        charterDate: '2019-04-30',
        history: CLUB_7238597,
        recordsStartDate: '2017-01-31',
      })
      expect(rows(r)).toEqual([
        ['Chartered', 'Apr 2019'],
        ['In District 61', ''],
      ])
      expect(r.recordsStart).toBeNull()
    })

    it('uses the district’s own earliest snapshot, not a global 2016–17', () => {
      // D113's first snapshot is 2018-07-31: a 2018-01 charter predates it.
      const club: ClubDistrictHistoryClub = {
        ...CLUB_7238597,
        spans: [{ from: '2018-07-31', to: null, districtId: '113' }],
      }
      expect(
        buildClubLifecycle({
          charterDate: '2018-01-15',
          history: club,
          recordsStartDate: '2018-07-31',
        }).recordsStart
      ).toBe('2018–19')
      expect(
        buildClubLifecycle({
          charterDate: '2018-01-15',
          history: club,
          recordsStartDate: '2017-01-31',
        }).recordsStart
      ).toBeNull()
    })

    it('no note without a charter date or without the district’s earliest snapshot', () => {
      expect(
        buildClubLifecycle({
          history: CLUB_5193,
          recordsStartDate: '2017-01-31',
        }).recordsStart
      ).toBeNull()
      expect(
        buildClubLifecycle({ charterDate: '2000-10-12', history: CLUB_5193 })
          .recordsStart
      ).toBeNull()
    })

    it('an observed move: "Moved from District Y to District X", by program year (club 977)', () => {
      const r = buildClubLifecycle({
        charterDate: '1987-02-15',
        history: CLUB_977,
        recordsStartDate: '2017-01-31',
      })
      expect(rows(r)).toEqual([
        ['Chartered', 'Feb 1987'],
        ['Moved from District 1 to District 201', '2026–27 program year'],
      ])
      expect(r.events.map(e => e.current)).toEqual([false, true])
      expect(r.recordsStart).toBe('2016–17')
      expect(r.historyAvailable).toBe(true)
    })

    // Ron, 2026-10-19 (#2170): a move the history dates to the day
    // (`firstSeenOn`, #1816) reads by month and year; without it, by PY.
    it('a move dated to the day by the history (#1816) reads month and year', () => {
      const r = buildClubLifecycle({
        charterDate: '1987-02-15',
        history: CLUB_977_EXACT,
      })
      expect(rows(r)).toEqual([
        ['Chartered', 'Feb 1987'],
        ['Moved from District 1 to District 201', 'Jul 2026'],
      ])
    })

    it('a mid-year move with a day reads its own month, not the program year', () => {
      const r = buildClubLifecycle({
        history: {
          ...CLUB_977,
          spans: [
            { from: '2017-01-31', to: '2026-02-28', districtId: '09' },
            {
              from: '2025-07-31',
              to: null,
              districtId: '02',
              firstSeenOn: '2026-03-31',
            },
          ],
        },
      })
      expect(rows(r)).toEqual([
        ['Moved from District 9 to District 2', 'Mar 2026'],
      ])
    })

    it('one row per move, each naming where it came from, the last one current (club 6197)', () => {
      const r = buildClubLifecycle({ history: CLUB_6197 })
      expect(rows(r)).toEqual([
        ['Moved from District 72 to District 112', '2018–19 program year'],
        ['Moved from District 112 to District 72', '2026–27 program year'],
      ])
      expect(r.events.map(e => e.current)).toEqual([false, true])
    })

    it('two spans in one district ("01" and "1") are not a move', () => {
      const r = buildClubLifecycle({
        history: {
          ...CLUB_977,
          spans: [
            { from: '2017-01-31', to: '2020-06-30', districtId: '01' },
            { from: '2020-07-31', to: null, districtId: '1' },
          ],
        },
      })
      expect(rows(r)).toEqual([['In District 1', '']])
      expect(r.events[0]?.current).toBe(true)
    })
  })

  it('a club no longer seen ends with its last record and has no current row', () => {
    const r = buildClubLifecycle({ history: CLUB_1597 })
    expect(rows(r)).toEqual([['Last record in District 7', 'Mar 2019']])
    expect(r.events.some(e => e.current)).toBe(false)
  })

  it('dates the last record to the day when the history can vouch for it (#1816)', () => {
    const closed: ClubDistrictHistoryClub = {
      ...CLUB_1597,
      spans: [{ ...CLUB_1597.spans[0]!, lastSeenOn: '2019-03-31' }],
    }
    expect(rows(buildClubLifecycle({ history: closed }))).toEqual([
      ['Last record in District 7', 'Mar 31, 2019'],
    ])
  })

  it('adds a suspension with its full date, after the moves', () => {
    const r = buildClubLifecycle({
      charterDate: '1987-02-15',
      history: CLUB_977,
      suspendDate: '2026-10-01',
    })
    expect(rows(r).at(-1)).toEqual(['Suspended', 'Oct 1, 2026'])
    expect(r.events.at(-1)?.kind).toBe('suspended')
  })

  it('passes former names through', () => {
    expect(buildClubLifecycle({ history: CLUB_497 }).formerNames).toEqual([
      'Westlake Toastmasters Club',
    ])
  })

  it('without history: the charter row alone, flagged unavailable', () => {
    const r = buildClubLifecycle({ charterDate: '1993-08', history: null })
    expect(rows(r)).toEqual([['Chartered', 'Aug 1993']])
    expect(r.historyAvailable).toBe(false)
    expect(r.formerNames).toEqual([])
  })

  it('year-only and unparseable charter dates', () => {
    expect(
      rows(buildClubLifecycle({ charterDate: '1960', history: null }))
    ).toEqual([['Chartered', '1960']])
    expect(
      buildClubLifecycle({ charterDate: 'n/a', history: null }).events
    ).toEqual([])
  })

  it('names a non-numeric district as printed', () => {
    const r = buildClubLifecycle({
      history: {
        ...CLUB_1597,
        spans: [{ from: '2017-01-31', to: null, districtId: 'F' }],
      },
    })
    expect(r.events[0]?.title).toBe('In District F')
  })
})
