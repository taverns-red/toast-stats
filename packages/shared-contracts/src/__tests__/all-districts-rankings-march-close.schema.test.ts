import { describe, expect, it } from 'vitest'

import { DistrictRankingSchema } from '../index.js'

/**
 * #1614: the rankings row carries the March close's new and charter payments
 * (`marchCloseNewPayments`, `marchCloseCharterPayments`) so the President's
 * Membership Retention Award estimate can be computed from one file.
 *
 * Both fields are optional (ADR 0019): every existing rankings file lacks them
 * and must keep parsing.
 */
const ROW_WITHOUT_MARCH_CLOSE = {
  districtId: '61',
  districtName: '61',
  region: '05',
  paidClubs: 158,
  paidClubBase: 156,
  clubGrowthPercent: 1.28,
  totalPayments: 5913,
  paymentBase: 5764,
  paymentGrowthPercent: 2.59,
  activeClubs: 162,
  distinguishedClubs: 72,
  selectDistinguished: 12,
  presidentsDistinguished: 16,
  distinguishedPercent: 46.15384615384615,
  clubsRank: 42,
  paymentsRank: 44,
  distinguishedRank: 63,
  aggregateScore: 238,
  overallRank: 49,
  newPayments: 1339,
  aprilPayments: 2371,
  octoberPayments: 2067,
  latePayments: 11,
  charterPayments: 125,
} as const

describe('DistrictRankingSchema March-close payments (#1614)', () => {
  it('parses an older row that has neither field', () => {
    const result = DistrictRankingSchema.safeParse(ROW_WITHOUT_MARCH_CLOSE)
    expect(result.success).toBe(true)
    expect(
      (result.data as Record<string, unknown> | undefined)
        ?.marchCloseNewPayments
    ).toBeUndefined()
    expect(
      (result.data as Record<string, unknown> | undefined)
        ?.marchCloseCharterPayments
    ).toBeUndefined()
  })

  it('round-trips a row that carries both fields', () => {
    const row = {
      ...ROW_WITHOUT_MARCH_CLOSE,
      marchCloseNewPayments: 1100,
      marchCloseCharterPayments: 120,
    }
    const result = DistrictRankingSchema.safeParse(row)
    expect(result.success).toBe(true)
    expect(
      (result.data as Record<string, unknown> | undefined)
        ?.marchCloseNewPayments
    ).toBe(1100)
    expect(
      (result.data as Record<string, unknown> | undefined)
        ?.marchCloseCharterPayments
    ).toBe(120)

    const again = DistrictRankingSchema.safeParse(
      JSON.parse(JSON.stringify(result.data))
    )
    expect(
      (again.data as Record<string, unknown> | undefined)?.marchCloseNewPayments
    ).toBe(1100)
    expect(
      (again.data as Record<string, unknown> | undefined)
        ?.marchCloseCharterPayments
    ).toBe(120)
  })

  it('rejects non-numeric values', () => {
    const result = DistrictRankingSchema.safeParse({
      ...ROW_WITHOUT_MARCH_CLOSE,
      marchCloseNewPayments: 'many',
    })
    expect(result.success).toBe(false)
  })
})
