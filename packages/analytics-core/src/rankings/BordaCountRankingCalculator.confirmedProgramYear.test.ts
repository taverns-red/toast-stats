/**
 * The confirmed-Distinguished ladder's program year comes from `asOfDate`
 * (#2324, the #1284 / #1622 tripwire).
 *
 * `asOfDate` is the snapshot's logical date. A June close collected in July
 * has an `asOfDate` of 06-30, which is in the closing PY. This pins
 * `programYearForDate(asOfDate)` to the closing PY at the July boundary.
 * No production caller builds this calculator today, so there is no
 * collection date that could reach it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const spy = vi.hoisted(() => ({ programYears: [] as (string | undefined)[] }))

vi.mock('./confirmedDistinguished.js', async importOriginal => {
  const actual =
    await importOriginal<typeof import('./confirmedDistinguished.js')>()
  return {
    ...actual,
    countConfirmedDistinguishedClubs: (
      ...args: Parameters<typeof actual.countConfirmedDistinguishedClubs>
    ) => {
      spy.programYears.push(args[2])
      return actual.countConfirmedDistinguishedClubs(...args)
    },
  }
})

import {
  BordaCountRankingCalculator,
  type RankingDistrictStatistics,
} from './BordaCountRankingCalculator.js'

function district(asOfDate: string): RankingDistrictStatistics {
  return {
    districtId: '14',
    asOfDate,
    membership: { total: 100, change: 5, changePercent: 5, byClub: [] },
    clubs: {
      total: 50,
      active: 50,
      suspended: 0,
      ineligible: 0,
      low: 0,
      distinguished: 0,
    },
    education: { totalAwards: 0, byType: [], topClubs: [] },
    districtPerformance: [
      {
        DISTRICT: '14',
        REGION: '1',
        '% Club Growth': '5%',
        '% Payment Growth': '3%',
        'Paid Clubs': 50,
        'Paid Club Base': 48,
        'Total YTD Payments': 4200,
        'Payment Base': 4000,
        'Total Distinguished Clubs': 0,
        'Active Clubs': 50,
        'Select Distinguished Clubs': 0,
        'Presidents Distinguished Clubs': 0,
        '% Distinguished Clubs': '0%',
      },
      { Club: '00001401', 'Apr. Ren.': '22' },
    ],
    clubPerformance: [
      {
        'Club Number': '00001401',
        'Goals Met': 6,
        'Mem. Base': 15,
        'Active Members': 25,
      },
    ],
  }
}

describe('BordaCountRankingCalculator — confirmed Distinguished PY (#2324)', () => {
  beforeEach(() => {
    spy.programYears = []
  })

  it('a June close (asOfDate 06-30) uses the closing PY', async () => {
    await new BordaCountRankingCalculator().calculateRankings([
      district('2025-06-30'),
    ])
    expect(spy.programYears).toEqual(['2024-2025'])
  })

  it('the first day of the next PY uses the next PY', async () => {
    await new BordaCountRankingCalculator().calculateRankings([
      district('2025-07-01'),
    ])
    expect(spy.programYears).toEqual(['2025-2026'])
  })
})
