/**
 * #1805 — the club hero's lineage chip, built from the club-district
 * history (#1782): "District 201 (District 1 until June 2026)".
 *
 * Fixtures are the recorded prod entries (shards 97 and 77, 2026-10-13/14).
 */
import { describe, it, expect } from 'vitest'
import type { ClubDistrictHistoryClub } from '@taverns-red/shared-contracts'
import shard97 from '../../__tests__/fixtures/club-district-history-97-2026-10-13.recorded.json'
// The fold's output on recorded club-race stores of the 2026 reformation
// (scripts/lib/__tests__/clubDistrictHistory.changePoints.test.ts).
import shard77Exact from '../../__tests__/fixtures/club-district-history-77-change-points.fold.json'
import { buildClubLineage } from '../clubLineage'

const CLUB_497 = shard97.clubs['497'] as ClubDistrictHistoryClub
const CLUB_7238597 = shard97.clubs['7238597'] as ClubDistrictHistoryClub

// Club 977 as served on prod (config/club-district-history/77.json,
// asOf 2026-10-14).
const CLUB_977: ClubDistrictHistoryClub = {
  name: 'Professional Women Toastmasters',
  formerNames: [],
  firstSeen: '2017-01-31',
  lastSeen: '2026-10-14',
  spans: [
    { from: '2017-01-31', to: '2026-06-30', districtId: '01' },
    { from: '2026-07-26', to: null, districtId: '201' },
  ],
  byProgramYear: {
    '2016-2017': '01',
    '2025-2026': '01',
    '2026-2027': '201',
  },
}

describe('buildClubLineage (#1805)', () => {
  it('names the day the club left when the history dates it (#1816)', () => {
    const exact = shard77Exact.clubs['977'] as ClubDistrictHistoryClub
    expect(buildClubLineage(exact, '201')).toEqual({
      formerDistricts: ['District 1 until June 30, 2026'],
      formerNames: [],
    })
  })

  it('names the former district and when the club left it', () => {
    expect(buildClubLineage(CLUB_977, '201')).toEqual({
      formerDistricts: ['District 1 until June 2026'],
      formerNames: [],
    })
  })

  it('carries former names', () => {
    expect(buildClubLineage(CLUB_497, '219')).toEqual({
      formerDistricts: ['District 10 until June 2026'],
      formerNames: ['Westlake Toastmasters Club'],
    })
  })

  it('is omitted for a club that never moved and never renamed', () => {
    expect(buildClubLineage(CLUB_7238597, '61')).toBeNull()
  })

  it('shows former names alone for a club that renamed but never moved', () => {
    const renamed = { ...CLUB_7238597, formerNames: ['Elgin Speakers'] }
    expect(buildClubLineage(renamed, '61')).toEqual({
      formerDistricts: [],
      formerNames: ['Elgin Speakers'],
    })
  })

  it('is omitted when the history is unavailable', () => {
    expect(buildClubLineage(null, '201')).toBeNull()
  })

  it('matches the page district padding-tolerantly ("1" vs "01")', () => {
    const backToOne: ClubDistrictHistoryClub = {
      ...CLUB_977,
      spans: [
        { from: '2017-01-31', to: '2019-06-30', districtId: '201' },
        { from: '2019-07-31', to: null, districtId: '01' },
      ],
    }
    expect(buildClubLineage(backToOne, '1')?.formerDistricts).toEqual([
      'District 201 until June 2019',
    ])
  })

  it('lists only the spans before the page district, newest first', () => {
    const twice: ClubDistrictHistoryClub = {
      ...CLUB_977,
      spans: [
        { from: '2017-01-31', to: '2019-06-30', districtId: 'F' },
        { from: '2019-07-31', to: '2026-06-30', districtId: '01' },
        { from: '2026-07-26', to: null, districtId: '201' },
      ],
    }
    expect(buildClubLineage(twice, '201')?.formerDistricts).toEqual([
      'District 1 until June 2026',
      'District F until June 2019',
    ])
  })

  it('says nothing about districts when the page district is not in the history', () => {
    // A pre-move page (#1804) has its own banner; the chip must not claim
    // a lineage relative to a district the club was never in.
    expect(buildClubLineage(CLUB_977, '61')).toBeNull()
  })
})
