/* A category every district is tied in (#2797). The pipeline marks it on
   each rank-history point; files written before the flag existed have none
   and must read exactly as before. */

import { describe, it, expect } from 'vitest'
import { extractEndOfYearRankings } from '../globalRankingsUtils'
import type {
  HistoricalRankPoint,
  ProgramYearWithData,
  RankHistoryResponse,
} from '../../types/districts'

const history = (
  extra: Partial<HistoricalRankPoint> = {}
): RankHistoryResponse => ({
  districtId: '61',
  districtName: 'District 61',
  history: [
    {
      date: '2026-08-01',
      aggregateScore: 100,
      clubsRank: 12,
      paymentsRank: 30,
      distinguishedRank: 1,
      overallRank: 15,
      totalDistricts: 94,
      ...extra,
    },
  ],
  programYear: {
    startDate: '2026-07-01',
    endDate: '2027-06-30',
    year: '2026-2027',
  },
})

const programYear = {
  year: '2026-2027',
  startDate: '2026-07-01',
  endDate: '2027-06-30',
  hasCompleteData: false,
} as ProgramYearWithData

describe('extractEndOfYearRankings tie flags (#2797)', () => {
  it('marks a category tied when the latest point says so', () => {
    const r = extractEndOfYearRankings(
      history({ distinguishedTied: true }),
      programYear
    )
    expect(r?.distinguishedClubs.tied).toBe(true)
    expect(r?.paidClubs.tied).toBeUndefined()
    expect(r?.membershipPayments.tied).toBeUndefined()
  })

  it('reads an old point without flags as not tied, unchanged', () => {
    const r = extractEndOfYearRankings(history(), programYear)
    expect(r?.distinguishedClubs).toEqual({
      rank: 1,
      totalDistricts: 94,
      percentile: 98.9,
    })
    expect(r?.paidClubs.tied).toBeUndefined()
  })
})
