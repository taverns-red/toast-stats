import { describe, it, expect } from 'vitest'
import type { ClubDistrictHistoryClub } from '@taverns-red/shared-contracts'
import { buildClubLifecycle } from '../clubLifecycle'
import shard77Exact from '../../__tests__/fixtures/club-district-history-77-change-points.fold.json'

/**
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
// (#1816): the move is dated to the day, the first record is not.
const CLUB_977_EXACT = shard77Exact.clubs['977'] as ClubDistrictHistoryClub

const rows = (r: ReturnType<typeof buildClubLifecycle>) =>
  r.events.map(e => [e.title, e.when])

describe('buildClubLifecycle', () => {
  it('dates a move to the day when the history can vouch for it (#1816)', () => {
    const r = buildClubLifecycle({
      charterDate: '1987-02-15',
      history: CLUB_977_EXACT,
    })
    expect(rows(r)).toEqual([
      ['Chartered', 'Feb 1987'],
      ['First record in District 1', '2017–18 program year'],
      ['Moved to District 201', 'Jul 26, 2026'],
    ])
  })

  it('dates the last record to the day when the history can vouch for it (#1816)', () => {
    const closed: ClubDistrictHistoryClub = {
      ...CLUB_1597,
      spans: [{ ...CLUB_1597.spans[0]!, lastSeenOn: '2019-03-31' }],
    }
    expect(rows(buildClubLifecycle({ history: closed }))).toEqual([
      ['First record in District 7', '2016–17 program year'],
      ['Last record in District 7', 'Mar 31, 2019'],
    ])
  })

  it('charter, first record and the move, oldest first (club 977)', () => {
    const r = buildClubLifecycle({
      charterDate: '1987-02-15',
      history: CLUB_977,
    })
    expect(rows(r)).toEqual([
      ['Chartered', 'Feb 1987'],
      ['First record in District 1', '2016–17 program year'],
      ['Moved to District 201', '2026–27 program year'],
    ])
    expect(r.events.map(e => e.current)).toEqual([false, false, true])
    expect(r.historyAvailable).toBe(true)
  })

  // The history is program-year granular: a span's `from` is the first
  // date of the PY's store (2018-07-31), not the club's first appearance, so
  // a club chartered in April 2019 has a 2018-19 first record. Charter and
  // first record in the same PY read charter first, and spans are labelled
  // by program year, never by a month the data cannot vouch for.
  it('a charter inside the first record’s program year comes first (club 7238597)', () => {
    const r = buildClubLifecycle({
      charterDate: '2019-04-30',
      history: CLUB_7238597,
    })
    expect(rows(r)).toEqual([
      ['Chartered', 'Apr 2019'],
      ['First record in District 61', '2018–19 program year'],
    ])
    expect(r.events.map(e => e.current)).toEqual([false, true])
  })

  it('one row per move, the last one current (club 6197)', () => {
    const r = buildClubLifecycle({ history: CLUB_6197 })
    expect(rows(r)).toEqual([
      ['First record in District 72', '2016–17 program year'],
      ['Moved to District 112', '2018–19 program year'],
      ['Moved to District 72', '2026–27 program year'],
    ])
    expect(r.events.filter(e => e.current)).toHaveLength(1)
  })

  it('a club no longer seen ends with its last record and has no current row', () => {
    const r = buildClubLifecycle({ history: CLUB_1597 })
    expect(rows(r)).toEqual([
      ['First record in District 7', '2016–17 program year'],
      ['Last record in District 7', 'Mar 2019'],
    ])
    expect(r.events.some(e => e.current)).toBe(false)
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
    expect(r.events[0]?.title).toBe('First record in District F')
  })
})
