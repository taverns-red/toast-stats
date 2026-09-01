import { describe, expect, it } from 'vitest'

import { DistrictRankingSchema } from '../index.js'

/**
 * #1497 (epic #1496) — `suspendedClubs` joins `newCharteredClubs` on the
 * rankings row, fed by the `Susp MM/DD/YY` branch of the same
 * `Charter Date/Suspend Date` column.
 *
 * The field must be **optional**: historical rankings files were rebuilt on the
 * runner without raw CSVs (R2) and carry no suspension count at all, so every
 * one of the five live PY-end rankings files would fail a required field.
 */

/**
 * A verbatim live rankings row, captured 2026-08-31 from
 * `cdn.taverns.red/snapshots/2026-06-30/all-districts-rankings.json`
 * (`rankings[]` where `districtId === '61'`). It predates this field, so it is
 * exactly the "old file" shape the optionality has to keep parsing.
 */
const LIVE_ROW_WITHOUT_SUSPENDED = {
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
  smedleyDistinguished: 14,
  dspSubmitted: true,
  trainingMet: true,
  marketAnalysisSubmitted: true,
  communicationPlanSubmitted: true,
  regionAdvisorVisitMet: true,
  clubsWith20PlusMembers: 63,
  newCharteredClubs: 0,
  newPayments: 1339,
  aprilPayments: 2371,
  octoberPayments: 2067,
  latePayments: 11,
  charterPayments: 125,
} as const

describe('DistrictRankingSchema.suspendedClubs (#1497)', () => {
  it('parses a live pre-#1497 rankings row that has no suspendedClubs', () => {
    const result = DistrictRankingSchema.safeParse(LIVE_ROW_WITHOUT_SUSPENDED)
    expect(result.success).toBe(true)
    expect(result.data?.suspendedClubs).toBeUndefined()
  })

  it('round-trips a new row that carries suspendedClubs', () => {
    const withSuspended = { ...LIVE_ROW_WITHOUT_SUSPENDED, suspendedClubs: 4 }
    const result = DistrictRankingSchema.safeParse(withSuspended)
    expect(result.success).toBe(true)
    expect(result.data?.suspendedClubs).toBe(4)

    const roundTripped = DistrictRankingSchema.safeParse(
      JSON.parse(JSON.stringify(result.data))
    )
    expect(roundTripped.success).toBe(true)
    expect(roundTripped.data?.suspendedClubs).toBe(4)
  })

  it('rejects a non-numeric suspendedClubs', () => {
    const result = DistrictRankingSchema.safeParse({
      ...LIVE_ROW_WITHOUT_SUSPENDED,
      suspendedClubs: 'four',
    })
    expect(result.success).toBe(false)
  })
})
