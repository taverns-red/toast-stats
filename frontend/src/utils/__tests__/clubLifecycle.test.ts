import { describe, it, expect } from 'vitest'
import type { ClubDistrictHistoryClub } from '@taverns-red/shared-contracts'
import { buildClubLifecycle } from '../clubLifecycle'

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

const rows = (r: ReturnType<typeof buildClubLifecycle>) =>
  r.events.map(e => [e.title, e.when])

describe('buildClubLifecycle', () => {
  it('charter, first record and the move, oldest first (club 977)', () => {
    const r = buildClubLifecycle({
      charterDate: '1987-02-15',
      history: CLUB_977,
    })
    expect(rows(r)).toEqual([
      ['Chartered', 'Feb 1987'],
      ['First record in District 1', 'Jan 2017'],
      ['Moved to District 201', 'Jul 2026'],
    ])
    expect(r.events.map(e => e.current)).toEqual([false, false, true])
    expect(r.historyAvailable).toBe(true)
  })

  it('keeps the data order when the first record predates the charter date', () => {
    const r = buildClubLifecycle({
      charterDate: '2019-04-30',
      history: CLUB_7238597,
    })
    expect(rows(r)).toEqual([
      ['First record in District 61', 'Jul 2018'],
      ['Chartered', 'Apr 2019'],
    ])
    // The current district is still the one marked current.
    expect(r.events.find(e => e.current)?.kind).toBe('first')
  })

  it('one row per move, the last one current (club 6197)', () => {
    const r = buildClubLifecycle({ history: CLUB_6197 })
    expect(rows(r)).toEqual([
      ['First record in District 72', 'Jan 2017'],
      ['Moved to District 112', 'Jul 2018'],
      ['Moved to District 72', 'Jul 2026'],
    ])
    expect(r.events.filter(e => e.current)).toHaveLength(1)
  })

  it('a club no longer seen ends with its last record and has no current row', () => {
    const r = buildClubLifecycle({ history: CLUB_1597 })
    expect(rows(r)).toEqual([
      ['First record in District 7', 'Jan 2017'],
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
