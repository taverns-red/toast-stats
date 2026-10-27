/**
 * Program-year-aware Distinguished District ladder and per-tier countdown
 * (#2307). The region scoreboard asks, for each tier, how far the nearest
 * district below it still has to go — under the selected program year's own
 * rules (Item 1490 and its revisions; docs/investigations/1116-historical-drp-rules.md).
 */

import { describe, it, expect } from 'vitest'
import {
  DistinguishedDistrictCalculator,
  districtTiersForProgramYear,
  remainingToDistrictTier,
} from './DistinguishedDistrictCalculator.js'
import type { DistrictRanking } from '@taverns-red/shared-contracts'

const counts = {
  paidClubBase: 100,
  paymentBase: 1000,
  paidClubs: 100,
  totalPayments: 1000,
  distinguishedClubs: 0,
}

describe('districtTiersForProgramYear (#2307)', () => {
  it('lists the four tiers, lowest first, from 2018-19 on', () => {
    for (const py of ['2026-2027', '2025-2026', '2022-2023', '2018-2019']) {
      expect(districtTiersForProgramYear(py)).toEqual([
        'Distinguished',
        'Select',
        'Presidents',
        'Smedley',
      ])
    }
  })

  it('has no Smedley tier before 2018-19', () => {
    expect(districtTiersForProgramYear('2017-2018')).toEqual([
      'Distinguished',
      'Select',
      'Presidents',
    ])
  })
})

describe('remainingToDistrictTier (#2307)', () => {
  it('counts down to the 2026-27 tiers (1/3/5/8% growth, 45/50/55/60%)', () => {
    expect(
      remainingToDistrictTier(counts, 'Distinguished', '2026-2027')
    ).toEqual({
      paidClubsRemaining: 1,
      paymentsRemaining: 10,
      distinguishedClubsRemaining: 45,
    })
    expect(remainingToDistrictTier(counts, 'Smedley', '2026-2027')).toEqual({
      paidClubsRemaining: 8,
      paymentsRemaining: 80,
      distinguishedClubsRemaining: 60,
    })
  })

  it('equals the calculator minimum-tier countdown for the current rules', () => {
    const ranking = {
      districtId: '61',
      districtName: 'District 61',
      region: '05',
      paidClubs: 137,
      paidClubBase: 158,
      clubGrowthPercent: -13.29,
      totalPayments: 3531,
      paymentBase: 5886,
      paymentGrowthPercent: -40.01,
      activeClubs: 137,
      distinguishedClubs: 2,
      selectDistinguished: 0,
      presidentsDistinguished: 0,
      distinguishedPercent: 1.27,
      clubsRank: 1,
      paymentsRank: 1,
      distinguishedRank: 1,
      aggregateScore: 0,
      overallRank: 1,
    } as unknown as DistrictRanking
    const status = new DistinguishedDistrictCalculator().calculate(
      ranking,
      '2026-2027'
    )
    expect(
      remainingToDistrictTier(ranking, 'Distinguished', '2026-2027')
    ).toEqual({
      paidClubsRemaining: status.paidClubsRemaining,
      paymentsRemaining: status.paymentsRemaining,
      distinguishedClubsRemaining: status.distinguishedClubsRemaining,
    })
  })

  it('applies the 2022-25 net-club rules: no net loss, then net +1 for Select', () => {
    // 2022-23..2024-25: clubs 0% growth with no-net-loss (Distinguished) and
    // +1 net (Select); distinguished 40% / 45%.
    expect(
      remainingToDistrictTier(
        { ...counts, paidClubs: 98 },
        'Distinguished',
        '2023-2024'
      )
    ).toEqual({
      paidClubsRemaining: 2,
      paymentsRemaining: 10,
      distinguishedClubsRemaining: 40,
    })
    expect(remainingToDistrictTier(counts, 'Select', '2023-2024')).toEqual({
      paidClubsRemaining: 1,
      paymentsRemaining: 30,
      distinguishedClubsRemaining: 45,
    })
  })

  it('handles the 1.5% entry growth of 2018-22', () => {
    expect(
      remainingToDistrictTier(counts, 'Distinguished', '2019-2020')
    ).toEqual({
      paidClubsRemaining: 2,
      paymentsRemaining: 15,
      distinguishedClubsRemaining: 40,
    })
  })

  it('is null for a tier the program year does not have', () => {
    expect(remainingToDistrictTier(counts, 'Smedley', '2016-2017')).toBeNull()
  })

  it('is zero, never negative, for a met metric', () => {
    expect(
      remainingToDistrictTier(
        {
          ...counts,
          paidClubs: 120,
          totalPayments: 2000,
          distinguishedClubs: 70,
        },
        'Smedley',
        '2026-2027'
      )
    ).toEqual({
      paidClubsRemaining: 0,
      paymentsRemaining: 0,
      distinguishedClubsRemaining: 0,
    })
  })
})
