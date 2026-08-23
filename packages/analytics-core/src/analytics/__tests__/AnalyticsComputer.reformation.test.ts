/**
 * Year-over-year across the 2026 district reformation (#1442).
 *
 * A district that kept its id but absorbed another district's clubs on
 * 2026-07-01 is not the district that held that id a year earlier. Comparing
 * it against its own pre-merge self reads as enormous organic growth. It did
 * not grow — it annexed.
 *
 * `computeYearOverYear` already has the exact channel for "this comparison is
 * not available, and here is why": `dataAvailable: false` + `message`. That is
 * the same shape a renumbered district (no prior-year file at all) resolves to
 * today, so the frontend needs no new branch to handle it.
 */

import { describe, it, expect } from 'vitest'
import { AnalyticsComputer } from '../AnalyticsComputer.js'
import { BordaCountRankingCalculator } from '../../rankings/BordaCountRankingCalculator.js'
import { DISTRICT_REFORMATION_NOTICE } from '@taverns-red/shared-contracts'
import type { DistrictStatistics, ClubStatistics } from '../../interfaces.js'

function club(overrides: Partial<ClubStatistics> = {}): ClubStatistics {
  return {
    clubId: '1234',
    clubName: 'Test Club',
    divisionId: 'A',
    areaId: 'A1',
    divisionName: 'Division A',
    areaName: 'Area A1',
    membershipCount: 25,
    paymentsCount: 20,
    dcpGoals: 5,
    status: 'Active',
    octoberRenewals: 10,
    aprilRenewals: 5,
    newMembers: 5,
    membershipBase: 20,
    ...overrides,
  }
}

function roster(count: number, membershipCount = 25): ClubStatistics[] {
  return Array.from({ length: count }, (_, i) =>
    club({ clubId: `club-${i}`, clubName: `Club ${i}`, membershipCount })
  )
}

function snapshot(
  districtId: string,
  snapshotDate: string,
  clubs: ClubStatistics[]
): DistrictStatistics {
  return {
    districtId,
    snapshotDate,
    clubs,
    divisions: [],
    areas: [],
    totals: {
      totalClubs: clubs.length,
      totalMembership: clubs.reduce((s, c) => s + c.membershipCount, 0),
      totalPayments: clubs.reduce((s, c) => s + c.paymentsCount, 0),
      distinguishedClubs: clubs.filter(c => c.dcpGoals >= 5).length,
      selectDistinguishedClubs: clubs.filter(c => c.dcpGoals >= 7).length,
      presidentDistinguishedClubs: clubs.filter(c => c.dcpGoals >= 9).length,
    },
  }
}

describe('computeYearOverYear across the 2026 district reformation', () => {
  it('suppresses the comparison for a surviving id that absorbed another district', () => {
    const computer = new AnalyticsComputer()

    // District 61 held 60 clubs a year ago; it absorbed a neighbour on
    // 2026-07-01 and now carries 108. Membership would read +80%.
    const previous = snapshot('61', '2025-11-30', roster(60))
    const current = snapshot('61', '2026-11-30', roster(108))

    const result = computer.computeYearOverYear(
      '61',
      [previous, current],
      '2026-11-30'
    )

    expect(result.dataAvailable).toBe(false)
    expect(result.message).toBe(DISTRICT_REFORMATION_NOTICE)
    expect(result.metrics).toBeUndefined()
  })

  it('suppresses the comparison for a surviving id that was split apart', () => {
    const computer = new AnalyticsComputer()

    const previous = snapshot('91', '2025-11-30', roster(120))
    const current = snapshot('91', '2026-11-30', roster(70))

    const result = computer.computeYearOverYear(
      '91',
      [previous, current],
      '2026-11-30'
    )

    expect(result.dataAvailable).toBe(false)
    expect(result.message).toBe(DISTRICT_REFORMATION_NOTICE)
  })

  it('leaves a stable-roster district comparable across the boundary', () => {
    const computer = new AnalyticsComputer()

    const previous = snapshot('7', '2025-11-30', roster(82, 24))
    const current = snapshot('7', '2026-11-30', roster(79, 26))

    const result = computer.computeYearOverYear(
      '7',
      [previous, current],
      '2026-11-30'
    )

    expect(result.dataAvailable).toBe(true)
    expect(result.metrics?.clubCount.current).toBe(79)
    expect(result.metrics?.clubCount.previous).toBe(82)
  })

  it('leaves an ordinary year-over-year comparison untouched', () => {
    const computer = new AnalyticsComputer()

    // Same discontinuous jump, but a year that does not straddle 2026-07-01.
    const previous = snapshot('61', '2024-11-30', roster(60))
    const current = snapshot('61', '2025-11-30', roster(108))

    const result = computer.computeYearOverYear(
      '61',
      [previous, current],
      '2025-11-30'
    )

    expect(result.dataAvailable).toBe(true)
    expect(result.metrics?.clubCount.change).toBe(48)
  })

  it('still reports the plain "no previous year data" message for a renumbered district', () => {
    const computer = new AnalyticsComputer()

    // District 218 did not exist a year ago — its prior-year file 404s, so
    // only the current snapshot reaches the computer.
    const current = snapshot('218', '2026-11-30', roster(40))

    const result = computer.computeYearOverYear('218', [current], '2026-11-30')

    expect(result.dataAvailable).toBe(false)
    expect(result.message).toContain('Previous year data not available')
    expect(result.message).not.toBe(DISTRICT_REFORMATION_NOTICE)
  })
})

describe('TI-rebased award growth metrics are untouched by #1442', () => {
  /**
   * `clubGrowthPercent` and `paymentGrowthPercent` are read verbatim from TI's
   * own `% Club Growth` / `% Payment Growth` columns, which TI rebases against
   * the post-reformation `Paid Club Base` / `Payment Base`. They are already
   * correct, they decide awards, and they are the thing most likely to be
   * broken by a careless fix in this area. This pins them: a district with a
   * blatantly discontinuous roster across the boundary still yields exactly
   * the numbers TI published.
   */
  it('passes TI’s published growth percentages through for a merged district', () => {
    const calculator = new BordaCountRankingCalculator()

    const districts = [
      {
        districtId: '61',
        districtPerformance: [
          {
            DISTRICT: '61',
            REGION: '7',
            // TI has already rebased these against the post-merge base.
            '% Club Growth': '2.4',
            '% Payment Growth': '-1.8',
            'Paid Clubs': '108',
            'Paid Club Base': '105',
            'Total YTD Payments': '4200',
            'Payment Base': '4277',
            'Total Distinguished Clubs': '30',
            'Active Clubs': '108',
            'Select Distinguished Clubs': '8',
            'Presidents Distinguished Clubs': '5',
            'Smedley Distinguished Clubs': '1',
          },
        ],
      },
      {
        districtId: '7',
        districtPerformance: [
          {
            DISTRICT: '7',
            REGION: '1',
            '% Club Growth': '-3.7',
            '% Payment Growth': '0.5',
            'Paid Clubs': '79',
            'Paid Club Base': '82',
            'Total YTD Payments': '3100',
            'Payment Base': '3085',
            'Total Distinguished Clubs': '21',
            'Active Clubs': '79',
            'Select Distinguished Clubs': '6',
            'Presidents Distinguished Clubs': '3',
            'Smedley Distinguished Clubs': '0',
          },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any

    const metrics = calculator.extractRankingMetrics(districts)

    const merged = metrics.find(m => m.districtId === '61')
    expect(merged?.clubGrowthPercent).toBe(2.4)
    expect(merged?.paymentGrowthPercent).toBe(-1.8)
    expect(merged?.paidClubBase).toBe(105)
    expect(merged?.paymentBase).toBe(4277)

    const stable = metrics.find(m => m.districtId === '7')
    expect(stable?.clubGrowthPercent).toBe(-3.7)
    expect(stable?.paymentGrowthPercent).toBe(0.5)
  })
})
