/**
 * Club-race district change points (#1816, Phase 2 of epic #1781).
 *
 * The store records, per club, the first and last date it was seen under
 * each district (min/max, so any walk order converges). These pure helpers
 * turn that record into the runs a reader can trust:
 * - a run wholly inside an earlier run is a shadow listing (the club listed
 *   under two districts at once, e.g. a June close collected under the new
 *   structure, #2079) and never becomes a change point;
 * - the district in force on a date is the latest surviving run that had
 *   started by then.
 */

import { describe, it, expect } from 'vitest'
import {
  ClubRaceStoreSchema,
  ClubDistrictHistoryShardSchema,
  clubDistrictInForce,
  resolveClubDistrictRuns,
} from '../index.js'

describe('resolveClubDistrictRuns (#1816)', () => {
  it('orders the runs by first sighting', () => {
    expect(
      resolveClubDistrictRuns([
        { districtId: '201', from: '2026-07-26', to: '2026-10-16' },
        { districtId: '01', from: '2025-07-31', to: '2026-06-30' },
      ])
    ).toEqual([
      { districtId: '01', from: '2025-07-31', to: '2026-06-30' },
      { districtId: '201', from: '2026-07-26', to: '2026-10-16' },
    ])
  })

  it('drops a same-date listing under a second district (the incumbent holds)', () => {
    // Club 977 on 2026-06-30: district_01 AND district_201 list it.
    expect(
      resolveClubDistrictRuns([
        { districtId: '201', from: '2026-06-30', to: '2026-06-30' },
        { districtId: '01', from: '2025-07-31', to: '2026-06-30' },
      ])
    ).toEqual([{ districtId: '01', from: '2025-07-31', to: '2026-06-30' }])
  })

  it('keeps a real move whose runs only touch', () => {
    expect(
      resolveClubDistrictRuns([
        { districtId: '10', from: '2025-07-31', to: '2026-01-31' },
        { districtId: '11', from: '2026-01-31', to: '2026-06-30' },
      ])
    ).toHaveLength(2)
  })

  it('is deterministic for two identical one-day runs', () => {
    const a = { districtId: '20', from: '2026-03-31', to: '2026-03-31' }
    const b = { districtId: '19', from: '2026-03-31', to: '2026-03-31' }
    expect(resolveClubDistrictRuns([a, b])).toEqual(
      resolveClubDistrictRuns([b, a])
    )
    expect(resolveClubDistrictRuns([a, b])).toHaveLength(1)
  })

  it('returns an empty list for no record', () => {
    expect(resolveClubDistrictRuns(undefined)).toEqual([])
  })
})

describe('clubDistrictInForce (#1816)', () => {
  const history = [
    { districtId: '10', from: '2025-07-31', to: '2026-01-31' },
    { districtId: '11', from: '2026-02-28', to: '2026-06-30' },
  ]

  it('is the district of the latest run started on or before the date', () => {
    expect(clubDistrictInForce(history, '2025-12-31')).toBe('10')
    expect(clubDistrictInForce(history, '2026-02-28')).toBe('11')
    expect(clubDistrictInForce(history, '2026-06-30')).toBe('11')
  })

  it('is null before the first sighting or with no record', () => {
    expect(clubDistrictInForce(history, '2025-07-01')).toBeNull()
    expect(clubDistrictInForce(undefined, '2026-01-01')).toBeNull()
  })

  it('ignores a shadow listing', () => {
    expect(
      clubDistrictInForce(
        [
          { districtId: '01', from: '2025-07-31', to: '2026-06-30' },
          { districtId: '201', from: '2026-06-30', to: '2026-06-30' },
        ],
        '2026-06-30'
      )
    ).toBe('01')
  })
})

describe('schemas carry the change points (#1816)', () => {
  it('the club-race store accepts firstSeen, districtHistory and districtHistoryGaps', () => {
    const parsed = ClubRaceStoreSchema.parse({
      _format: { version: '1.0.0', type: 'club-race-store' },
      programYear: '2026-2027',
      updatedAt: '2026-10-16T00:00:00.000Z',
      observedDates: ['2026-07-26'],
      districtHistoryGaps: [],
      clubs: {
        '977': {
          clubId: '977',
          clubName: 'Professional Women Toastmasters',
          districtId: '201',
          lastSeen: '2026-07-26',
          firstSeen: '2026-07-26',
          districtHistory: [
            { districtId: '201', from: '2026-07-26', to: '2026-07-26' },
          ],
          reached: {},
        },
      },
    })
    expect(parsed.districtHistoryGaps).toEqual([])
    expect(parsed.clubs['977']!.firstSeen).toBe('2026-07-26')
    expect(parsed.clubs['977']!.districtHistory).toHaveLength(1)
  })

  it('a shard span accepts date-exact firstSeenOn / lastSeenOn and stays valid without them', () => {
    const shard = {
      _format: { version: '1.1.0', type: 'club-district-history-shard' },
      shard: '77',
      asOf: '2026-10-16',
      clubs: {
        '977': {
          name: 'Professional Women Toastmasters',
          formerNames: [],
          firstSeen: '2017-01-31',
          lastSeen: '2026-10-16',
          spans: [
            {
              from: '2017-01-31',
              to: '2026-06-30',
              districtId: '01',
              lastSeenOn: '2026-06-30',
            },
            {
              from: '2026-07-26',
              to: null,
              districtId: '201',
              firstSeenOn: '2026-07-26',
            },
          ],
          byProgramYear: { '2026-2027': '201' },
        },
      },
    }
    const parsed = ClubDistrictHistoryShardSchema.parse(shard)
    expect(parsed.clubs['977']!.spans[0]!.lastSeenOn).toBe('2026-06-30')
    expect(parsed.clubs['977']!.spans[1]!.firstSeenOn).toBe('2026-07-26')
  })
})
