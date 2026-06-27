/**
 * Property-Based Tests for MetricRankingsCalculator
 *
 * @pbt-justification Warranted per .kiro/steering/testing.md criteria:
 *   - Mathematical invariant: metric ranking must produce correct ordinal positions
 *   - Complex input space: generated metric values across varied district counts and metrics
 *
 * **Feature: per-metric-rankings**
 *
 * **Property 1: Percentile calculation correctness**
 * *For any* valid world rank and total districts count (where totalDistricts > 1
 * and worldRank is not null), the world percentile SHALL equal
 * `((totalDistricts - worldRank) / totalDistricts) * 100` rounded to 1 decimal place.
 * **Validates: Requirements 2.1, 2.2**
 *
 * **Property 2: Region rank ordering invariant**
 * *For any* set of districts in the same region, the district with the highest
 * metric value SHALL have region rank 1, and districts with equal values SHALL
 * have equal ranks.
 * **Validates: Requirements 3.2, 6.1**
 *
 * These tests verify that the MetricRankingsCalculator produces correct
 * rankings across all valid inputs using property-based testing with fast-check.
 *
 * Properties tested:
 * 1. Percentile formula correctness: ((totalDistricts - worldRank) / totalDistricts) * 100
 * 2. Rounding to 1 decimal place
 * 3. Result is always in range [0, 100) for valid inputs
 * 4. Region rank ordering: highest value gets rank 1
 * 5. Tied values get equal ranks
 * 6. Ranks are contiguous (no gaps except for ties)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as fc from 'fast-check'
import {
  MetricRankingsCalculator,
  type MetricType,
} from '../MetricRankingsCalculator.js'
import type {
  AllDistrictsRankingsData,
  DistrictRanking,
} from '@taverns-red/shared-contracts'

// ========== Arbitraries (Generators) ==========

/**
 * Generate a valid totalDistricts count (> 1 for percentile calculation)
 * Using realistic bounds: 2 to 200 districts (Toastmasters has ~120 districts)
 */
const validTotalDistrictsArb = fc.integer({ min: 2, max: 200 })

/**
 * Generate a valid world rank given a total districts count.
 * World rank must be between 1 and totalDistricts (inclusive).
 */
const validWorldRankArb = (totalDistricts: number): fc.Arbitrary<number> =>
  fc.integer({ min: 1, max: totalDistricts })

/**
 * Generate a tuple of (worldRank, totalDistricts) where both are valid.
 * This ensures worldRank is always <= totalDistricts.
 */
const validRankAndTotalArb: fc.Arbitrary<{
  worldRank: number
  totalDistricts: number
}> = validTotalDistrictsArb.chain(totalDistricts =>
  validWorldRankArb(totalDistricts).map(worldRank => ({
    worldRank,
    totalDistricts,
  }))
)

// ========== Helper Functions ==========

/**
 * Calculate the expected percentile using the formula from requirements.
 * Formula: ((totalDistricts - worldRank) / totalDistricts) * 100
 * Rounded to 1 decimal place.
 *
 * @param worldRank - The district's world rank (1 = best)
 * @param totalDistricts - Total number of districts worldwide
 * @returns Expected percentile value
 */
function calculateExpectedPercentile(
  worldRank: number,
  totalDistricts: number
): number {
  const percentile = ((totalDistricts - worldRank) / totalDistricts) * 100
  return Math.round(percentile * 10) / 10
}

/**
 * Check if a number is rounded to exactly 1 decimal place.
 * A number is considered rounded to 1 decimal place if multiplying by 10
 * results in an integer (within floating point tolerance).
 *
 * @param value - The number to check
 * @returns true if the value is rounded to 1 decimal place
 */
function isRoundedToOneDecimal(value: number): boolean {
  const multiplied = value * 10
  return Math.abs(multiplied - Math.round(multiplied)) < 1e-9
}

// ========== Property Tests ==========

describe('MetricRankingsCalculator Property Tests', () => {
  /**
   * Feature: per-metric-rankings
   * Property 1: Percentile calculation correctness
   *
   * **Validates: Requirements 2.1, 2.2**
   */
  describe('Property 1: Percentile calculation correctness', () => {
    let calculator: MetricRankingsCalculator

    beforeEach(() => {
      calculator = new MetricRankingsCalculator()
    })

    /**
     * Property 1.1: Percentile formula correctness
     * For any valid worldRank (1 to totalDistricts) and totalDistricts (> 1),
     * the calculated percentile equals ((totalDistricts - worldRank) / totalDistricts) * 100
     * rounded to 1 decimal place.
     *
     * **Validates: Requirements 2.1, 2.2**
     */
    it('should calculate percentile using the correct formula for all valid inputs', () => {
      fc.assert(
        fc.property(validRankAndTotalArb, ({ worldRank, totalDistricts }) => {
          const result = calculator.calculateWorldPercentile(
            worldRank,
            totalDistricts
          )
          const expected = calculateExpectedPercentile(
            worldRank,
            totalDistricts
          )

          // Result should not be null for valid inputs
          expect(result).not.toBeNull()

          // Result should match expected formula
          expect(result).toBe(expected)

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 1.2: Result is always rounded to 1 decimal place
     * The percentile result should always be rounded to exactly 1 decimal place.
     *
     * **Validates: Requirement 2.2**
     */
    it('should always round percentile to 1 decimal place', () => {
      fc.assert(
        fc.property(validRankAndTotalArb, ({ worldRank, totalDistricts }) => {
          const result = calculator.calculateWorldPercentile(
            worldRank,
            totalDistricts
          )

          // Result should not be null for valid inputs
          expect(result).not.toBeNull()

          // Result should be rounded to 1 decimal place
          expect(isRoundedToOneDecimal(result!)).toBe(true)

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 1.3: Result is always in range [0, 100) for valid inputs
     * - Rank 1 (best) should give percentile close to 100 (but < 100)
     * - Rank = totalDistricts (worst) should give percentile = 0
     *
     * **Validates: Requirements 2.1, 2.2**
     */
    it('should always return percentile in range [0, 100) for valid inputs', () => {
      fc.assert(
        fc.property(validRankAndTotalArb, ({ worldRank, totalDistricts }) => {
          const result = calculator.calculateWorldPercentile(
            worldRank,
            totalDistricts
          )

          // Result should not be null for valid inputs
          expect(result).not.toBeNull()

          // Result should be >= 0
          expect(result).toBeGreaterThanOrEqual(0)

          // Result should be < 100 (only rank 0 would give 100%, which is invalid)
          expect(result).toBeLessThan(100)

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 1.4: Monotonicity - better rank (lower number) gives higher percentile
     * If rankA < rankB (rankA is better), then percentileA > percentileB.
     *
     * **Validates: Requirement 2.1**
     */
    it('should give higher percentile for better (lower) rank', () => {
      fc.assert(
        fc.property(
          // Generate totalDistricts >= 3 to ensure we can have two different ranks
          fc.integer({ min: 3, max: 200 }),
          totalDistricts => {
            // Generate two different ranks
            const rankA = fc.sample(
              fc.integer({ min: 1, max: totalDistricts - 1 }),
              1
            )[0]!
            const rankB = rankA + 1 // rankB is worse (higher number)

            const percentileA = calculator.calculateWorldPercentile(
              rankA,
              totalDistricts
            )
            const percentileB = calculator.calculateWorldPercentile(
              rankB,
              totalDistricts
            )

            // Both should be valid
            expect(percentileA).not.toBeNull()
            expect(percentileB).not.toBeNull()

            // Better rank (lower number) should have higher percentile
            expect(percentileA).toBeGreaterThan(percentileB!)

            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * Property 1.5: Boundary values - rank 1 gives maximum percentile, rank = total gives 0
     *
     * **Validates: Requirements 2.1, 2.2**
     */
    it('should give maximum percentile for rank 1 and 0 for last rank', () => {
      fc.assert(
        fc.property(validTotalDistrictsArb, totalDistricts => {
          // Rank 1 (best) should give maximum percentile
          const percentileRank1 = calculator.calculateWorldPercentile(
            1,
            totalDistricts
          )
          const expectedRank1 = calculateExpectedPercentile(1, totalDistricts)
          expect(percentileRank1).toBe(expectedRank1)

          // Rank = totalDistricts (worst) should give 0
          const percentileLast = calculator.calculateWorldPercentile(
            totalDistricts,
            totalDistricts
          )
          expect(percentileLast).toBe(0)

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 1.6: Null handling - returns null for invalid inputs
     * - totalDistricts <= 1 should return null
     * - worldRank = null should return null
     *
     * **Validates: Requirements 2.3, 2.4**
     */
    it('should return null for invalid inputs', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 200 }), // worldRank
          fc.integer({ min: -10, max: 1 }), // totalDistricts <= 1
          (worldRank, totalDistricts) => {
            const result = calculator.calculateWorldPercentile(
              worldRank,
              totalDistricts
            )
            expect(result).toBeNull()
            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * Property 1.7: Null worldRank always returns null
     *
     * **Validates: Requirement 2.4**
     */
    it('should return null when worldRank is null', () => {
      fc.assert(
        fc.property(validTotalDistrictsArb, totalDistricts => {
          const result = calculator.calculateWorldPercentile(
            null,
            totalDistricts
          )
          expect(result).toBeNull()
          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 1.8: Determinism - same inputs always produce same output
     *
     * **Validates: Requirements 2.1, 2.2**
     */
    it('should be deterministic - same inputs produce same output', () => {
      fc.assert(
        fc.property(validRankAndTotalArb, ({ worldRank, totalDistricts }) => {
          const result1 = calculator.calculateWorldPercentile(
            worldRank,
            totalDistricts
          )
          const result2 = calculator.calculateWorldPercentile(
            worldRank,
            totalDistricts
          )

          expect(result1).toBe(result2)

          return true
        }),
        { numRuns: 100 }
      )
    })
  })

  /**
   * Feature: per-metric-rankings
   * Property 2: Region rank ordering invariant
   *
   * *For any* set of districts in the same region, the district with the highest
   * metric value SHALL have region rank 1, and districts with equal values SHALL
   * have equal ranks.
   *
   * **Validates: Requirements 3.2, 6.1**
   */
  describe('Property 2: Region rank ordering invariant', () => {
    let calculator: MetricRankingsCalculator

    beforeEach(() => {
      calculator = new MetricRankingsCalculator()
    })

    // ========== Arbitraries (Generators) for Region Rank Tests ==========

    /**
     * Generate a valid region name.
     * Using realistic region names like "Region 1" through "Region 20".
     */
    const validRegionArb = fc
      .integer({ min: 1, max: 20 })
      .map(n => `Region ${n}`)

    /**
     * Generate a valid metric type.
     */
    const metricTypeArb: fc.Arbitrary<MetricType> = fc.constantFrom(
      'clubs',
      'payments',
      'distinguished'
    )

    /**
     * Generate a valid metric value (percentage).
     * Using realistic bounds: -50% to 150% for growth metrics.
     */
    const metricValueArb = fc.double({ min: -50, max: 150, noNaN: true })

    /**
     * Generate a district ranking with specified region and metric values.
     */
    const districtRankingArb = (
      districtId: string,
      region: string,
      clubGrowthPercent: number,
      paymentGrowthPercent: number,
      distinguishedPercent: number
    ): DistrictRanking => ({
      districtId,
      districtName: `District ${districtId}`,
      region,
      paidClubs: 100,
      paidClubBase: 95,
      clubGrowthPercent,
      totalPayments: 5000,
      paymentBase: 4800,
      paymentGrowthPercent,
      activeClubs: 98,
      distinguishedClubs: 45,
      selectDistinguished: 15,
      presidentsDistinguished: 10,
      distinguishedPercent,
      clubsRank: 1,
      paymentsRank: 1,
      distinguishedRank: 1,
      aggregateScore: 150,
      overallRank: 1,
    })

    /**
     * Generate a set of districts in the same region with varying metric values.
     * Returns 2-10 districts all in the same region.
     */
    const districtsInSameRegionArb: fc.Arbitrary<{
      rankings: DistrictRanking[]
      region: string
      metric: MetricType
    }> = fc
      .tuple(
        validRegionArb,
        metricTypeArb,
        fc.array(fc.tuple(metricValueArb, metricValueArb, metricValueArb), {
          minLength: 2,
          maxLength: 10,
        })
      )
      .map(([region, metric, metricValues]) => {
        const rankings = metricValues.map(
          ([clubs, payments, distinguished], index) =>
            districtRankingArb(
              `${index + 1}`,
              region,
              clubs,
              payments,
              distinguished
            )
        )
        return { rankings, region, metric }
      })

    /**
     * Generate districts with some having the same metric value (ties).
     * Ensures at least one tie exists.
     */
    const districtsWithTiesArb: fc.Arbitrary<{
      rankings: DistrictRanking[]
      region: string
      metric: MetricType
    }> = fc
      .tuple(
        validRegionArb,
        metricTypeArb,
        metricValueArb, // The tied value
        fc.integer({ min: 2, max: 5 }), // Number of districts with tied value
        fc.array(metricValueArb, { minLength: 0, maxLength: 5 }) // Other unique values
      )
      .map(([region, metric, tiedValue, tiedCount, otherValues]) => {
        const rankings: DistrictRanking[] = []
        let districtIndex = 1

        // Add districts with tied value
        for (let i = 0; i < tiedCount; i++) {
          const values = {
            clubs: metric === 'clubs' ? tiedValue : 0,
            payments: metric === 'payments' ? tiedValue : 0,
            distinguished: metric === 'distinguished' ? tiedValue : 0,
          }
          rankings.push(
            districtRankingArb(
              `${districtIndex++}`,
              region,
              values.clubs,
              values.payments,
              values.distinguished
            )
          )
        }

        // Add districts with other values
        for (const value of otherValues) {
          const values = {
            clubs: metric === 'clubs' ? value : 0,
            payments: metric === 'payments' ? value : 0,
            distinguished: metric === 'distinguished' ? value : 0,
          }
          rankings.push(
            districtRankingArb(
              `${districtIndex++}`,
              region,
              values.clubs,
              values.payments,
              values.distinguished
            )
          )
        }

        return { rankings, region, metric }
      })

    /**
     * Helper to create AllDistrictsRankingsData from rankings array.
     */
    function createRankingsData(
      rankings: DistrictRanking[]
    ): AllDistrictsRankingsData {
      return {
        metadata: {
          snapshotId: '2024-01-15',
          calculatedAt: '2024-01-15T00:00:00.000Z',
          schemaVersion: '1.0',
          calculationVersion: '1.0',
          rankingVersion: '2.0',
          sourceCsvDate: '2024-01-15',
          csvFetchedAt: '2024-01-15T00:00:00.000Z',
          totalDistricts: rankings.length,
          fromCache: false,
        },
        rankings,
      }
    }

    /**
     * Helper to get metric value from a district ranking.
     */
    function getMetricValue(
      ranking: DistrictRanking,
      metric: MetricType
    ): number {
      switch (metric) {
        case 'clubs':
          return ranking.clubGrowthPercent
        case 'payments':
          return ranking.paymentGrowthPercent
        case 'distinguished':
          return ranking.distinguishedPercent
      }
    }

    // ========== Property Tests ==========

    /**
     * Property 2.1: The district with the highest metric value in a region has rank 1
     *
     * **Validates: Requirement 3.2**
     */
    it('should assign rank 1 to the district with the highest metric value', () => {
      fc.assert(
        fc.property(
          districtsInSameRegionArb,
          ({ rankings, region, metric }) => {
            const allDistrictsRankings = createRankingsData(rankings)

            // Find the maximum metric value in the region
            const maxValue = Math.max(
              ...rankings.map(r => getMetricValue(r, metric))
            )

            // Find all districts with the maximum value
            const districtsWithMaxValue = rankings.filter(
              r => getMetricValue(r, metric) === maxValue
            )

            // All districts with max value should have rank 1
            for (const district of districtsWithMaxValue) {
              const result = calculator.calculateRegionRank(
                district.districtId,
                metric,
                allDistrictsRankings
              )
              expect(result.regionRank).toBe(1)
              expect(result.region).toBe(region)
            }

            return true
          }
        ),
        { numRuns: 100 }
      )
    })

    /**
     * Property 2.2: Districts with equal metric values have equal ranks
     *
     * **Validates: Requirement 6.1**
     */
    it('should assign equal ranks to districts with equal metric values', () => {
      fc.assert(
        fc.property(districtsWithTiesArb, ({ rankings, metric }) => {
          const allDistrictsRankings = createRankingsData(rankings)

          // Group districts by their metric value
          const valueToDistricts = new Map<number, DistrictRanking[]>()
          for (const ranking of rankings) {
            const value = getMetricValue(ranking, metric)
            const existing = valueToDistricts.get(value) ?? []
            existing.push(ranking)
            valueToDistricts.set(value, existing)
          }

          // For each group of districts with the same value, verify they have the same rank
          for (const [, districtsWithSameValue] of valueToDistricts) {
            if (districtsWithSameValue.length > 1) {
              const ranks = districtsWithSameValue.map(d => {
                const result = calculator.calculateRegionRank(
                  d.districtId,
                  metric,
                  allDistrictsRankings
                )
                return result.regionRank
              })

              // All ranks should be equal
              const firstRank = ranks[0]
              for (const rank of ranks) {
                expect(rank).toBe(firstRank)
              }
            }
          }

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 2.3: Ranks are contiguous (no gaps except for ties)
     *
     * After ties, the next rank should skip appropriately.
     * E.g., if 2 districts tie for rank 1, the next rank should be 3, not 2.
     *
     * **Validates: Requirements 3.2, 6.1**
     */
    it('should produce contiguous ranks with appropriate gaps for ties', () => {
      fc.assert(
        fc.property(districtsInSameRegionArb, ({ rankings, metric }) => {
          const allDistrictsRankings = createRankingsData(rankings)

          // Get all ranks for districts in the region
          const ranksWithValues: Array<{ rank: number; value: number }> = []
          for (const district of rankings) {
            const result = calculator.calculateRegionRank(
              district.districtId,
              metric,
              allDistrictsRankings
            )
            if (result.regionRank !== null) {
              ranksWithValues.push({
                rank: result.regionRank,
                value: getMetricValue(district, metric),
              })
            }
          }

          // Sort by value descending (highest first)
          ranksWithValues.sort((a, b) => b.value - a.value)

          // Verify rank progression
          let expectedRank = 1
          let previousValue: number | null = null
          let countAtCurrentRank = 0

          for (const { rank, value } of ranksWithValues) {
            if (previousValue === null || value !== previousValue) {
              // New value, update expected rank
              expectedRank = expectedRank + countAtCurrentRank
              countAtCurrentRank = 1
            } else {
              // Same value as previous, should have same rank
              countAtCurrentRank++
            }

            expect(rank).toBe(expectedRank)
            previousValue = value
          }

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 2.4: All districts in a region get a valid rank (1 to totalInRegion)
     *
     * **Validates: Requirement 3.2**
     */
    it('should assign valid ranks between 1 and totalInRegion to all districts', () => {
      fc.assert(
        fc.property(districtsInSameRegionArb, ({ rankings, metric }) => {
          const allDistrictsRankings = createRankingsData(rankings)
          const totalInRegion = rankings.length

          for (const district of rankings) {
            const result = calculator.calculateRegionRank(
              district.districtId,
              metric,
              allDistrictsRankings
            )

            // Rank should not be null for valid districts
            expect(result.regionRank).not.toBeNull()

            // Rank should be >= 1
            expect(result.regionRank).toBeGreaterThanOrEqual(1)

            // Rank should be <= totalInRegion
            expect(result.regionRank).toBeLessThanOrEqual(totalInRegion)

            // totalInRegion should match the number of districts
            expect(result.totalInRegion).toBe(totalInRegion)
          }

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 2.5: Monotonicity - higher metric value means better (lower or equal) rank
     *
     * If valueA > valueB, then rankA <= rankB (lower rank is better).
     *
     * **Validates: Requirement 3.2**
     */
    it('should give better (lower or equal) rank to districts with higher metric values', () => {
      fc.assert(
        fc.property(districtsInSameRegionArb, ({ rankings, metric }) => {
          const allDistrictsRankings = createRankingsData(rankings)

          // Get all ranks with their values
          const ranksWithValues: Array<{
            districtId: string
            rank: number
            value: number
          }> = []

          for (const district of rankings) {
            const result = calculator.calculateRegionRank(
              district.districtId,
              metric,
              allDistrictsRankings
            )
            if (result.regionRank !== null) {
              ranksWithValues.push({
                districtId: district.districtId,
                rank: result.regionRank,
                value: getMetricValue(district, metric),
              })
            }
          }

          // For any two districts, if valueA > valueB, then rankA <= rankB
          for (let i = 0; i < ranksWithValues.length; i++) {
            for (let j = i + 1; j < ranksWithValues.length; j++) {
              const a = ranksWithValues[i]!
              const b = ranksWithValues[j]!

              if (a.value > b.value) {
                expect(a.rank).toBeLessThanOrEqual(b.rank)
              } else if (b.value > a.value) {
                expect(b.rank).toBeLessThanOrEqual(a.rank)
              } else {
                // Equal values should have equal ranks
                expect(a.rank).toBe(b.rank)
              }
            }
          }

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 2.6: Determinism - same inputs always produce same output
     *
     * **Validates: Requirements 3.2, 6.1**
     */
    it('should be deterministic - same inputs produce same output', () => {
      fc.assert(
        fc.property(districtsInSameRegionArb, ({ rankings, metric }) => {
          const allDistrictsRankings = createRankingsData(rankings)

          for (const district of rankings) {
            const result1 = calculator.calculateRegionRank(
              district.districtId,
              metric,
              allDistrictsRankings
            )
            const result2 = calculator.calculateRegionRank(
              district.districtId,
              metric,
              allDistrictsRankings
            )

            expect(result1.regionRank).toBe(result2.regionRank)
            expect(result1.totalInRegion).toBe(result2.totalInRegion)
            expect(result1.region).toBe(result2.region)
          }

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 2.7: Region isolation - districts in different regions don't affect each other's ranks
     *
     * **Validates: Requirement 3.2**
     */
    it('should isolate rankings by region - different regions do not affect each other', () => {
      // Generate districts in two different regions
      const twoRegionsArb = fc
        .tuple(
          fc.integer({ min: 1, max: 10 }),
          fc.integer({ min: 11, max: 20 }),
          metricTypeArb,
          fc.array(metricValueArb, { minLength: 2, maxLength: 5 }),
          fc.array(metricValueArb, { minLength: 2, maxLength: 5 })
        )
        .map(([region1Num, region2Num, metric, values1, values2]) => {
          const region1 = `Region ${region1Num}`
          const region2 = `Region ${region2Num}`

          const rankings1 = values1.map((value, index) =>
            districtRankingArb(
              `R1-${index + 1}`,
              region1,
              metric === 'clubs' ? value : 0,
              metric === 'payments' ? value : 0,
              metric === 'distinguished' ? value : 0
            )
          )

          const rankings2 = values2.map((value, index) =>
            districtRankingArb(
              `R2-${index + 1}`,
              region2,
              metric === 'clubs' ? value : 0,
              metric === 'payments' ? value : 0,
              metric === 'distinguished' ? value : 0
            )
          )

          return {
            rankings: [...rankings1, ...rankings2],
            region1,
            region2,
            rankings1,
            rankings2,
            metric,
          }
        })

      fc.assert(
        fc.property(
          twoRegionsArb,
          ({ rankings, region1, rankings1, metric }) => {
            const allDistrictsRankings = createRankingsData(rankings)

            // Calculate ranks for region 1 districts
            const region1Ranks = rankings1.map(d => {
              const result = calculator.calculateRegionRank(
                d.districtId,
                metric,
                allDistrictsRankings
              )
              return {
                districtId: d.districtId,
                rank: result.regionRank,
                totalInRegion: result.totalInRegion,
                region: result.region,
              }
            })

            // Verify region 1 districts only see region 1 count
            for (const rankInfo of region1Ranks) {
              expect(rankInfo.totalInRegion).toBe(rankings1.length)
              expect(rankInfo.region).toBe(region1)
              expect(rankInfo.rank).toBeGreaterThanOrEqual(1)
              expect(rankInfo.rank).toBeLessThanOrEqual(rankings1.length)
            }

            return true
          }
        ),
        { numRuns: 100 }
      )
    })
  })
})
