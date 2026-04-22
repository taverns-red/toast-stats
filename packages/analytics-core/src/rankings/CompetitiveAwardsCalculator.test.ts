/**
 * Tests for CompetitiveAwardsCalculator (#330)
 *
 * Validates computation of three competitive district awards:
 * - President's Extension Award (top 3 net club growth)
 * - President's 20-Plus Award (top 3 % clubs with 20+ paid members)
 * - District Club Retention Award (top 3 retaining ≥90% paid clubs)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { CompetitiveAwardsCalculator } from './CompetitiveAwardsCalculator.js'
import type { DistrictRanking } from '@toastmasters/shared-contracts'

// Helper: build a minimal DistrictRanking with the fields competitive awards care about
function buildRanking(overrides: Partial<DistrictRanking>): DistrictRanking {
  return {
    districtId: '1',
    districtName: 'District 1',
    region: '1',
    paidClubs: 100,
    paidClubBase: 100,
    clubGrowthPercent: 0,
    totalPayments: 1000,
    paymentBase: 1000,
    paymentGrowthPercent: 0,
    activeClubs: 100,
    distinguishedClubs: 0,
    selectDistinguished: 0,
    presidentsDistinguished: 0,
    distinguishedPercent: 0,
    clubsRank: 1,
    paymentsRank: 1,
    distinguishedRank: 1,
    aggregateScore: 0,
    overallRank: 1,
    ...overrides,
  }
}

describe('CompetitiveAwardsCalculator', () => {
  let calculator: CompetitiveAwardsCalculator

  beforeEach(() => {
    calculator = new CompetitiveAwardsCalculator()
  })

  describe("President's Extension Award", () => {
    it('should rank districts by net club growth (paidClubs - paidClubBase)', () => {
      const rankings: DistrictRanking[] = [
        buildRanking({
          districtId: '1',
          paidClubs: 110,
          paidClubBase: 100,
        }), // +10
        buildRanking({
          districtId: '2',
          paidClubs: 95,
          paidClubBase: 100,
        }), // -5
        buildRanking({
          districtId: '3',
          paidClubs: 120,
          paidClubBase: 105,
        }), // +15
        buildRanking({
          districtId: '4',
          paidClubs: 100,
          paidClubBase: 100,
        }), // 0
      ]

      const result = calculator.calculate(rankings)

      // District 3 is #1 (+15), District 1 is #2 (+10), District 4 is #3 (0), District 2 is #4 (-5)
      expect(result.extensionAward[0]?.districtId).toBe('3')
      expect(result.extensionAward[0]?.rank).toBe(1)
      expect(result.extensionAward[0]?.value).toBe(15)
      expect(result.extensionAward[1]?.districtId).toBe('1')
      expect(result.extensionAward[1]?.value).toBe(10)
      expect(result.extensionAward[2]?.districtId).toBe('4')
      expect(result.extensionAward[2]?.value).toBe(0)
    })

    it('should mark top 3 districts as winners', () => {
      const rankings: DistrictRanking[] = [
        buildRanking({ districtId: '1', paidClubs: 110, paidClubBase: 100 }),
        buildRanking({ districtId: '2', paidClubs: 105, paidClubBase: 100 }),
        buildRanking({ districtId: '3', paidClubs: 103, paidClubBase: 100 }),
        buildRanking({ districtId: '4', paidClubs: 101, paidClubBase: 100 }),
      ]

      const result = calculator.calculate(rankings)

      expect(result.extensionAward[0]?.isWinner).toBe(true)
      expect(result.extensionAward[1]?.isWinner).toBe(true)
      expect(result.extensionAward[2]?.isWinner).toBe(true)
      expect(result.extensionAward[3]?.isWinner).toBe(false)
    })
  })

  describe("President's 20-Plus Award", () => {
    it('should rank districts by % clubs with 20+ paid members', () => {
      const rankings: DistrictRanking[] = [
        // 80% of clubs have 20+ members (8 of 10)
        buildRanking({
          districtId: '1',
          activeClubs: 10,
          clubsWith20PlusMembers: 8,
        }),
        // 50% (5 of 10)
        buildRanking({
          districtId: '2',
          activeClubs: 10,
          clubsWith20PlusMembers: 5,
        }),
        // 100% (10 of 10)
        buildRanking({
          districtId: '3',
          activeClubs: 10,
          clubsWith20PlusMembers: 10,
        }),
      ]

      const result = calculator.calculate(rankings)

      expect(result.twentyPlusAward[0]?.districtId).toBe('3')
      expect(result.twentyPlusAward[0]?.value).toBe(100)
      expect(result.twentyPlusAward[1]?.districtId).toBe('1')
      expect(result.twentyPlusAward[1]?.value).toBe(80)
      expect(result.twentyPlusAward[2]?.districtId).toBe('2')
      expect(result.twentyPlusAward[2]?.value).toBe(50)
    })

    it('should treat districts with 0 active clubs as 0%', () => {
      const rankings: DistrictRanking[] = [
        buildRanking({
          districtId: '1',
          activeClubs: 0,
          clubsWith20PlusMembers: 0,
        }),
        buildRanking({
          districtId: '2',
          activeClubs: 10,
          clubsWith20PlusMembers: 5,
        }),
      ]

      const result = calculator.calculate(rankings)

      const d1 = result.twentyPlusAward.find(r => r.districtId === '1')
      expect(d1?.value).toBe(0)
    })
  })

  describe('District Club Retention Award', () => {
    it('should rank districts by retention % (paidClubs / paidClubBase)', () => {
      const rankings: DistrictRanking[] = [
        // 95% retention (95/100)
        buildRanking({
          districtId: '1',
          paidClubs: 95,
          paidClubBase: 100,
        }),
        // 100% retention
        buildRanking({
          districtId: '2',
          paidClubs: 100,
          paidClubBase: 100,
        }),
        // 90% retention (boundary)
        buildRanking({
          districtId: '3',
          paidClubs: 90,
          paidClubBase: 100,
        }),
        // 85% retention (below threshold)
        buildRanking({
          districtId: '4',
          paidClubs: 85,
          paidClubBase: 100,
        }),
      ]

      const result = calculator.calculate(rankings)

      // Top 3 by retention: D2 (100), D1 (95), D3 (90)
      expect(result.retentionAward[0]?.districtId).toBe('2')
      expect(result.retentionAward[0]?.value).toBe(100)
      expect(result.retentionAward[1]?.districtId).toBe('1')
      expect(result.retentionAward[1]?.value).toBe(95)
      expect(result.retentionAward[2]?.districtId).toBe('3')
      expect(result.retentionAward[2]?.value).toBe(90)
    })

    it('should only mark districts with ≥90% retention as winners', () => {
      const rankings: DistrictRanking[] = [
        buildRanking({ districtId: '1', paidClubs: 100, paidClubBase: 100 }), // 100%
        buildRanking({ districtId: '2', paidClubs: 95, paidClubBase: 100 }), // 95%
        buildRanking({ districtId: '3', paidClubs: 89, paidClubBase: 100 }), // 89% - below
        buildRanking({ districtId: '4', paidClubs: 80, paidClubBase: 100 }), // 80%
      ]

      const result = calculator.calculate(rankings)

      // Only top 3 with ≥90% qualify; D3 and D4 cannot win even if they're top
      expect(result.retentionAward[0]?.isWinner).toBe(true)
      expect(result.retentionAward[1]?.isWinner).toBe(true)
      expect(result.retentionAward[2]?.isWinner).toBe(false) // D3 at 89%
      expect(result.retentionAward[3]?.isWinner).toBe(false)
    })

    it('should exclude newly chartered clubs from retention numerator (#336)', () => {
      // Two districts with identical paidClubs/paidClubBase ratios, but one
      // achieved its paid count via new charters (low retention) while the
      // other retained all its base clubs (100% retention).
      const rankings: DistrictRanking[] = [
        // D1: 50 base, 50 retained, 0 new charters → 50/50 = 100%
        buildRanking({
          districtId: '1',
          paidClubs: 50,
          paidClubBase: 50,
          newCharteredClubs: 0,
        }),
        // D2: 50 base, 46 retained, 4 new charters → 46/50 = 92%
        // Under the old (buggy) formula, this would score 50/50 = 100% and tie with D1.
        buildRanking({
          districtId: '2',
          paidClubs: 50,
          paidClubBase: 50,
          newCharteredClubs: 4,
        }),
      ]

      const result = calculator.calculate(rankings)

      expect(result.retentionAward[0]?.districtId).toBe('1')
      expect(result.retentionAward[0]?.value).toBe(100)
      expect(result.retentionAward[1]?.districtId).toBe('2')
      expect(result.retentionAward[1]?.value).toBe(92)
    })

    it('should not exceed 100% retention when new charters outpace losses (#336)', () => {
      // D1: Extension-style growth — 50 base, 48 retained, 6 new charters.
      // paidClubs = 54, paidClubBase = 50. Old formula: 108%. New formula: 96%.
      const rankings: DistrictRanking[] = [
        buildRanking({
          districtId: '1',
          paidClubs: 54,
          paidClubBase: 50,
          newCharteredClubs: 6,
        }),
      ]

      const result = calculator.calculate(rankings)

      expect(result.retentionAward[0]?.value).toBe(96)
    })

    it('should fall back to paidClubs / paidClubBase when newCharteredClubs is missing', () => {
      // Backward compatibility: older snapshots without the new field continue
      // to use the legacy formula.
      const rankings: DistrictRanking[] = [
        buildRanking({
          districtId: '1',
          paidClubs: 95,
          paidClubBase: 100,
          // newCharteredClubs intentionally undefined
        }),
      ]

      const result = calculator.calculate(rankings)

      expect(result.retentionAward[0]?.value).toBe(95)
    })

    it('should rank districts correctly when distinguishing retention from extension (#336)', () => {
      // Scenario from the reported bug: three districts at the top of the
      // Extension Award should not automatically be the top of the Retention
      // Award when their new-charter counts differ.
      const rankings: DistrictRanking[] = [
        // District with lots of growth but some base losses
        buildRanking({
          districtId: 'A',
          paidClubs: 54,
          paidClubBase: 50,
          newCharteredClubs: 6, // 48/50 = 96% retention
        }),
        // District with steady base, modest growth
        buildRanking({
          districtId: 'B',
          paidClubs: 52,
          paidClubBase: 50,
          newCharteredClubs: 2, // 50/50 = 100% retention
        }),
        // District with no growth and no losses
        buildRanking({
          districtId: 'C',
          paidClubs: 50,
          paidClubBase: 50,
          newCharteredClubs: 0, // 50/50 = 100% retention
        }),
      ]

      const result = calculator.calculate(rankings)

      // Extension ranks A first (net +4), B second (+2), C third (0)
      expect(result.extensionAward[0]?.districtId).toBe('A')

      // Retention puts B and C tied at 100%, A at 96% — decouples from extension
      const topRetention = result.retentionAward.filter(r => r.value === 100)
      expect(topRetention.map(r => r.districtId).sort()).toEqual(['B', 'C'])
      expect(result.retentionAward.find(r => r.districtId === 'A')?.value).toBe(
        96
      )
    })
  })

  describe('Per-district lookup', () => {
    it('should provide a per-district summary for fast frontend lookup', () => {
      const rankings: DistrictRanking[] = [
        buildRanking({
          districtId: '1',
          paidClubs: 110,
          paidClubBase: 100,
          activeClubs: 100,
          clubsWith20PlusMembers: 80,
        }),
        buildRanking({
          districtId: '2',
          paidClubs: 105,
          paidClubBase: 100,
          activeClubs: 100,
          clubsWith20PlusMembers: 60,
        }),
        buildRanking({
          districtId: '3',
          paidClubs: 103,
          paidClubBase: 100,
          activeClubs: 100,
          clubsWith20PlusMembers: 70,
        }),
      ]

      const result = calculator.calculate(rankings)

      const d1 = result.byDistrict['1']
      expect(d1).toBeDefined()
      expect(d1?.extensionRank).toBe(1)
      expect(d1?.twentyPlusRank).toBe(1)
      expect(d1?.retentionRank).toBeGreaterThan(0)
      expect(d1?.extensionIsWinner).toBe(true)
    })
  })
})
