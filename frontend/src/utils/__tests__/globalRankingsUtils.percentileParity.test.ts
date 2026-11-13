/* One percentile formula (#2613).
   The KPI cards read analytics-core's calculateWorldPercentile,
   (n - r) / n. The Rankings page used (n - r + 1) / n, so the same rank
   printed two different percentiles. Both paths must agree. */

import { describe, it, expect } from 'vitest'
import { MetricRankingsCalculator } from '@taverns-red/analytics-core'
import { extractEndOfYearRankings } from '../globalRankingsUtils'
import type {
  RankHistoryResponse,
  ProgramYearWithData,
} from '../../types/districts'

const history = (rank: number, total: number): RankHistoryResponse => ({
  districtId: '61',
  districtName: 'District 61',
  history: [
    {
      date: '2026-11-01',
      aggregateScore: 100,
      clubsRank: rank,
      paymentsRank: rank,
      distinguishedRank: rank,
      overallRank: rank,
      totalDistricts: total,
    },
  ],
  programYear: {
    startDate: '2026-07-01',
    endDate: '2027-06-30',
    year: '2026-2027',
  },
})

const programYear: ProgramYearWithData = {
  year: '2026-2027',
  startDate: '2026-07-01',
  endDate: '2027-06-30',
  hasCompleteData: false,
} as ProgramYearWithData

describe('Rankings page and KPI cards share one percentile formula (#2613)', () => {
  it.each([
    [12, 94],
    [1, 94],
    [94, 94],
    [47, 126],
  ])('rank %i of %i gives the same percentile on both paths', (rank, total) => {
    const kpi = new MetricRankingsCalculator().calculateWorldPercentile(
      rank,
      total
    )
    const rankings = extractEndOfYearRankings(history(rank, total), programYear)
    expect(rankings?.paidClubs.percentile).toBe(kpi)
    expect(rankings?.membershipPayments.percentile).toBe(kpi)
    expect(rankings?.distinguishedClubs.percentile).toBe(kpi)
    expect(rankings?.overall.percentile).toBe(kpi)
  })

  it('D61 payments, rank 12 of 94, is 87.2 on the Rankings page', () => {
    const rankings = extractEndOfYearRankings(history(12, 94), programYear)
    expect(rankings?.membershipPayments.percentile).toBe(87.2)
  })
})
