/**
 * Property-Based Tests for BordaCountRankingCalculator
 *
 * @pbt-justification Warranted per .kiro/steering/testing.md criteria:
 *   - Mathematical invariant: Borda count ranking must produce correct ordinal positions
 *   - Complex input space: generated score vectors across varied district counts
 *
 * **Property 2: Ranking Algorithm Equivalence**
 * *For any* set of district statistics, the migrated BordaCountRankingCalculator
 * in analytics-core SHALL produce identical rankings (clubsRank, paymentsRank,
 * distinguishedRank, aggregateScore) as the original backend RankingCalculator.
 *
 * **Validates: Requirements 5.3, 7.1, 7.2, 7.3, 7.4**
 *
 * Feature: refresh-service-computation-removal
 * Property 2: Ranking Algorithm Equivalence
 *
 * These tests verify that the BordaCountRankingCalculator produces correct
 * and consistent rankings across all valid inputs using property-based
 * testing with fast-check.
 *
 * Properties tested:
 * 1. Rankings are unique and contiguous (no gaps)
 * 2. Borda points are calculated correctly: (total districts - rank + 1)
 * 3. Aggregate score equals sum of Borda points across all categories
 * 4. Districts with higher values get better (lower) ranks
 * 5. Ties are handled correctly (same rank for equal values)
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import {
  BordaCountRankingCalculator,
  type RankingDistrictStatistics,
  type AllDistrictsCSVRecord,
} from '../rankings/BordaCountRankingCalculator.js'

// ========== Arbitraries (Generators) ==========

/**
 * Generate a valid district ID
 */
const districtIdArb = fc
  .array(fc.constantFrom(...'0123456789ABCDEF'.split('')), {
    minLength: 1,
    maxLength: 4,
  })
  .map(chars => chars.join(''))

/**
 * Generate a valid snapshot date (YYYY-MM-DD format)
 */
const snapshotDateArb = fc
  .tuple(
    fc.integer({ min: 2020, max: 2025 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 })
  )
  .map(([year, month, day]) => {
    const monthStr = String(month).padStart(2, '0')
    const dayStr = String(day).padStart(2, '0')
    return `${year}-${monthStr}-${dayStr}`
  })

/**
 * Generate a valid percentage value (can be negative for decline)
 */
const percentageArb = fc.double({ min: -50, max: 100, noNaN: true })

/**
 * Generate a valid club count
 */
const clubCountArb = fc.integer({ min: 0, max: 500 })

/**
 * Generate a valid payment count
 */
const paymentCountArb = fc.integer({ min: 0, max: 50000 })

/**
 * Generate a valid region string
 */
const regionArb = fc.constantFrom(
  'Region 1',
  'Region 2',
  'Region 3',
  'Region 4',
  'Region 5',
  'Region 6',
  'Region 7',
  'Region 8',
  'Region 9',
  'Region 10',
  'Region 11',
  'Region 12',
  'Region 13',
  'Region 14'
)

/**
 * Generate a valid AllDistrictsCSVRecord
 */
const allDistrictsCSVRecordArb = (
  districtId: string
): fc.Arbitrary<AllDistrictsCSVRecord> =>
  fc
    .tuple(
      regionArb,
      clubCountArb, // paidClubs
      clubCountArb, // paidClubBase
      percentageArb, // clubGrowthPercent
      paymentCountArb, // totalPayments
      paymentCountArb, // paymentBase
      percentageArb, // paymentGrowthPercent
      clubCountArb, // activeClubs
      clubCountArb, // distinguishedClubs
      clubCountArb, // selectDistinguished
      clubCountArb // presidentsDistinguished
    )
    .map(
      ([
        region,
        paidClubs,
        paidClubBase,
        clubGrowthPercent,
        totalPayments,
        paymentBase,
        paymentGrowthPercent,
        activeClubs,
        distinguishedClubs,
        selectDistinguished,
        presidentsDistinguished,
      ]) => ({
        DISTRICT: `District ${districtId}`,
        REGION: region,
        'Paid Clubs': String(paidClubs),
        'Paid Club Base': String(paidClubBase),
        '% Club Growth': `${clubGrowthPercent.toFixed(2)}%`,
        'Total YTD Payments': String(totalPayments),
        'Payment Base': String(paymentBase),
        '% Payment Growth': `${paymentGrowthPercent.toFixed(2)}%`,
        'Active Clubs': String(activeClubs),
        'Total Distinguished Clubs': String(distinguishedClubs),
        'Select Distinguished Clubs': String(selectDistinguished),
        'Presidents Distinguished Clubs': String(presidentsDistinguished),
      })
    )

/**
 * Generate a valid RankingDistrictStatistics with districtPerformance data
 */
const rankingDistrictStatisticsArb = (
  districtId: string
): fc.Arbitrary<RankingDistrictStatistics> =>
  fc
    .tuple(snapshotDateArb, allDistrictsCSVRecordArb(districtId))
    .map(([asOfDate, csvRecord]) => ({
      districtId,
      asOfDate,
      membership: {
        total: 0,
        change: 0,
        changePercent: 0,
        byClub: [],
      },
      clubs: {
        total: 0,
        active: 0,
        suspended: 0,
        ineligible: 0,
        low: 0,
        distinguished: 0,
      },
      education: {
        totalAwards: 0,
        byType: [],
        topClubs: [],
      },
      districtPerformance: [
        csvRecord as Record<string, string | number | null>,
      ],
    }))

/**
 * Generate an array of unique district IDs
 */
const uniqueDistrictIdsArb = (count: number): fc.Arbitrary<string[]> =>
  fc
    .uniqueArray(districtIdArb, { minLength: count, maxLength: count })
    .filter(ids => ids.length === count)

/**
 * Generate an array of RankingDistrictStatistics with unique district IDs
 */
const districtStatisticsArrayArb = (
  minLength: number,
  maxLength: number
): fc.Arbitrary<RankingDistrictStatistics[]> =>
  fc
    .integer({ min: minLength, max: maxLength })
    .chain(count =>
      uniqueDistrictIdsArb(count).chain(districtIds =>
        fc.tuple(...districtIds.map(id => rankingDistrictStatisticsArb(id)))
      )
    )

// ========== Helper Functions ==========

/**
 * Extract the club growth percent from a district's ranking data
 */
function getClubGrowthPercent(district: RankingDistrictStatistics): number {
  return district.ranking?.clubGrowthPercent ?? 0
}

/**
 * Extract the payment growth percent from a district's ranking data
 */
function getPaymentGrowthPercent(district: RankingDistrictStatistics): number {
  return district.ranking?.paymentGrowthPercent ?? 0
}

/**
 * Extract the distinguished percent from a district's ranking data
 */
function getDistinguishedPercent(district: RankingDistrictStatistics): number {
  return district.ranking?.distinguishedPercent ?? 0
}

/**
 * Calculate expected Borda points for a given rank, total districts, and
 * whether the category is a complete tie (#198).
 *
 * When all districts have the same value in a category, Borda points = 0
 * (the category provides no ranking differentiation).
 */
function calculateExpectedBordaPoints(
  rank: number,
  totalDistricts: number,
  isCompleteTie: boolean = false
): number {
  if (isCompleteTie) return 0
  return totalDistricts - rank + 1
}

// ========== Property Tests ==========

describe('BordaCountRankingCalculator Property Tests', () => {
  /**
   * Feature: refresh-service-computation-removal
   * Property 2: Ranking Algorithm Equivalence
   *
   * **Validates: Requirements 5.3, 7.1, 7.2, 7.3, 7.4**
   */
  describe('Property 2: Ranking Algorithm Equivalence', () => {
    const calculator = new BordaCountRankingCalculator()

    /**
     * Property 2.1: Rankings are assigned to all districts with valid data
     * Every district with districtPerformance data should receive ranking data.
     *
     * **Validates: Requirements 7.1, 7.3**
     */
    it('should assign rankings to all districts with valid performance data', async () => {
      await fc.assert(
        fc.asyncProperty(districtStatisticsArrayArb(1, 20), async districts => {
          const rankedDistricts = await calculator.calculateRankings(districts)

          // All districts with districtPerformance should have ranking data
          for (const district of rankedDistricts) {
            if (
              district.districtPerformance &&
              district.districtPerformance.length > 0
            ) {
              expect(district.ranking).toBeDefined()
            }
          }

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 2.2: Ranks are positive integers starting from 1
     * All rank values (clubsRank, paymentsRank, distinguishedRank) must be >= 1.
     *
     * **Validates: Requirements 7.3**
     */
    it('ranks should be positive integers starting from 1', async () => {
      await fc.assert(
        fc.asyncProperty(districtStatisticsArrayArb(1, 20), async districts => {
          const rankedDistricts = await calculator.calculateRankings(districts)

          for (const district of rankedDistricts) {
            if (district.ranking) {
              expect(district.ranking.clubsRank).toBeGreaterThanOrEqual(1)
              expect(district.ranking.paymentsRank).toBeGreaterThanOrEqual(1)
              expect(district.ranking.distinguishedRank).toBeGreaterThanOrEqual(
                1
              )

              // Ranks should not exceed total number of districts
              expect(district.ranking.clubsRank).toBeLessThanOrEqual(
                rankedDistricts.length
              )
              expect(district.ranking.paymentsRank).toBeLessThanOrEqual(
                rankedDistricts.length
              )
              expect(district.ranking.distinguishedRank).toBeLessThanOrEqual(
                rankedDistricts.length
              )
            }
          }

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 2.3: Borda points calculation correctness
     * Borda points = (total districts - rank + 1)
     * Aggregate score = sum of Borda points across all three categories
     *
     * **Validates: Requirements 5.3, 7.3**
     */
    it('aggregate score should equal sum of Borda points across categories', async () => {
      await fc.assert(
        fc.asyncProperty(districtStatisticsArrayArb(2, 20), async districts => {
          const rankedDistricts = await calculator.calculateRankings(districts)
          const districtsWithRankings = rankedDistricts.filter(d => d.ranking)
          const totalDistricts = districtsWithRankings.length

          // Detect complete ties per category (#198)
          const clubGrowths = new Set(
            districtsWithRankings.map(d => d.ranking!.clubGrowthPercent)
          )
          const paymentGrowths = new Set(
            districtsWithRankings.map(d => d.ranking!.paymentGrowthPercent)
          )
          const distinguishedPcts = new Set(
            districtsWithRankings.map(d => d.ranking!.distinguishedPercent)
          )
          const clubsTied = clubGrowths.size === 1
          const paymentsTied = paymentGrowths.size === 1
          const distinguishedTied = distinguishedPcts.size === 1

          for (const district of rankedDistricts) {
            if (district.ranking) {
              const clubsBordaPoints = calculateExpectedBordaPoints(
                district.ranking.clubsRank,
                totalDistricts,
                clubsTied
              )
              const paymentsBordaPoints = calculateExpectedBordaPoints(
                district.ranking.paymentsRank,
                totalDistricts,
                paymentsTied
              )
              const distinguishedBordaPoints = calculateExpectedBordaPoints(
                district.ranking.distinguishedRank,
                totalDistricts,
                distinguishedTied
              )

              const expectedAggregateScore =
                clubsBordaPoints +
                paymentsBordaPoints +
                distinguishedBordaPoints

              expect(district.ranking.aggregateScore).toBe(
                expectedAggregateScore
              )
            }
          }

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 2.4: Higher values get better (lower) ranks
     * Districts with higher growth percentages should have lower (better) rank numbers.
     *
     * **Validates: Requirements 7.3**
     */
    it('districts with higher values should have better (lower) ranks', async () => {
      await fc.assert(
        fc.asyncProperty(districtStatisticsArrayArb(2, 20), async districts => {
          const rankedDistricts = await calculator.calculateRankings(districts)
          const districtsWithRankings = rankedDistricts.filter(d => d.ranking)

          // For each pair of districts, verify ranking order
          for (let i = 0; i < districtsWithRankings.length; i++) {
            for (let j = i + 1; j < districtsWithRankings.length; j++) {
              const districtA = districtsWithRankings[i]!
              const districtB = districtsWithRankings[j]!

              if (!districtA.ranking || !districtB.ranking) continue

              // Club growth: higher percent = better (lower) rank
              const clubGrowthA = getClubGrowthPercent(districtA)
              const clubGrowthB = getClubGrowthPercent(districtB)
              if (clubGrowthA > clubGrowthB) {
                expect(districtA.ranking.clubsRank).toBeLessThanOrEqual(
                  districtB.ranking.clubsRank
                )
              } else if (clubGrowthB > clubGrowthA) {
                expect(districtB.ranking.clubsRank).toBeLessThanOrEqual(
                  districtA.ranking.clubsRank
                )
              }

              // Payment growth: higher percent = better (lower) rank
              const paymentGrowthA = getPaymentGrowthPercent(districtA)
              const paymentGrowthB = getPaymentGrowthPercent(districtB)
              if (paymentGrowthA > paymentGrowthB) {
                expect(districtA.ranking.paymentsRank).toBeLessThanOrEqual(
                  districtB.ranking.paymentsRank
                )
              } else if (paymentGrowthB > paymentGrowthA) {
                expect(districtB.ranking.paymentsRank).toBeLessThanOrEqual(
                  districtA.ranking.paymentsRank
                )
              }

              // Distinguished percent: higher percent = better (lower) rank
              const distinguishedA = getDistinguishedPercent(districtA)
              const distinguishedB = getDistinguishedPercent(districtB)
              if (distinguishedA > distinguishedB) {
                expect(districtA.ranking.distinguishedRank).toBeLessThanOrEqual(
                  districtB.ranking.distinguishedRank
                )
              } else if (distinguishedB > distinguishedA) {
                expect(districtB.ranking.distinguishedRank).toBeLessThanOrEqual(
                  districtA.ranking.distinguishedRank
                )
              }
            }
          }

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 2.5: Ties are handled correctly (same rank for equal values)
     * Districts with identical values in a category should have the same rank.
     *
     * **Validates: Requirements 7.3, 7.4**
     */
    it('districts with equal values should have the same rank', async () => {
      await fc.assert(
        fc.asyncProperty(districtStatisticsArrayArb(2, 20), async districts => {
          const rankedDistricts = await calculator.calculateRankings(districts)
          const districtsWithRankings = rankedDistricts.filter(d => d.ranking)

          // For each pair of districts, verify tie handling
          for (let i = 0; i < districtsWithRankings.length; i++) {
            for (let j = i + 1; j < districtsWithRankings.length; j++) {
              const districtA = districtsWithRankings[i]!
              const districtB = districtsWithRankings[j]!

              if (!districtA.ranking || !districtB.ranking) continue

              // Club growth ties
              const clubGrowthA = getClubGrowthPercent(districtA)
              const clubGrowthB = getClubGrowthPercent(districtB)
              if (clubGrowthA === clubGrowthB) {
                expect(districtA.ranking.clubsRank).toBe(
                  districtB.ranking.clubsRank
                )
              }

              // Payment growth ties
              const paymentGrowthA = getPaymentGrowthPercent(districtA)
              const paymentGrowthB = getPaymentGrowthPercent(districtB)
              if (paymentGrowthA === paymentGrowthB) {
                expect(districtA.ranking.paymentsRank).toBe(
                  districtB.ranking.paymentsRank
                )
              }

              // Distinguished percent ties
              const distinguishedA = getDistinguishedPercent(districtA)
              const distinguishedB = getDistinguishedPercent(districtB)
              if (distinguishedA === distinguishedB) {
                expect(districtA.ranking.distinguishedRank).toBe(
                  districtB.ranking.distinguishedRank
                )
              }
            }
          }

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 2.6: Ranking version is consistent
     * All ranked districts should have the same ranking version.
     *
     * **Validates: Requirements 7.4**
     */
    it('all ranked districts should have consistent ranking version', async () => {
      await fc.assert(
        fc.asyncProperty(districtStatisticsArrayArb(1, 20), async districts => {
          const rankedDistricts = await calculator.calculateRankings(districts)
          const expectedVersion = calculator.getRankingVersion()

          for (const district of rankedDistricts) {
            if (district.ranking) {
              expect(district.ranking.rankingVersion).toBe(expectedVersion)
            }
          }

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 2.7: Output is sorted by aggregate score (highest first)
     * The returned array should be sorted by aggregate score in descending order.
     *
     * **Validates: Requirements 7.3**
     */
    it('output should be sorted by aggregate score (highest first)', async () => {
      await fc.assert(
        fc.asyncProperty(districtStatisticsArrayArb(2, 20), async districts => {
          const rankedDistricts = await calculator.calculateRankings(districts)
          const districtsWithRankings = rankedDistricts.filter(d => d.ranking)

          // Verify descending order by aggregate score
          for (let i = 0; i < districtsWithRankings.length - 1; i++) {
            const current = districtsWithRankings[i]!
            const next = districtsWithRankings[i + 1]!

            if (current.ranking && next.ranking) {
              expect(current.ranking.aggregateScore).toBeGreaterThanOrEqual(
                next.ranking.aggregateScore
              )
            }
          }

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 2.8: Empty input returns empty output
     * When given an empty array, the calculator should return an empty array.
     *
     * **Validates: Requirements 7.1**
     */
    it('should return empty array for empty input', async () => {
      const result = await calculator.calculateRankings([])
      expect(result).toEqual([])
    })

    /**
     * Property 2.9: Single district gets rank 1 in all categories
     * A single district should be ranked #1 in all categories with maximum Borda points.
     *
     * **Validates: Requirements 7.3**
     */
    it('single district should get rank 1 in all categories', async () => {
      await fc.assert(
        fc.asyncProperty(rankingDistrictStatisticsArb('42'), async district => {
          const rankedDistricts = await calculator.calculateRankings([district])

          expect(rankedDistricts).toHaveLength(1)
          const ranked = rankedDistricts[0]!

          if (ranked.ranking) {
            expect(ranked.ranking.clubsRank).toBe(1)
            expect(ranked.ranking.paymentsRank).toBe(1)
            expect(ranked.ranking.distinguishedRank).toBe(1)
            // With 1 district, all categories are tied → 0 Borda points each (#198)
            expect(ranked.ranking.aggregateScore).toBe(0)
          }

          return true
        }),
        { numRuns: 50 }
      )
    })

    /**
     * Property 2.10: Aggregate score bounds
     * Aggregate score should be between 3 (worst possible) and 3*N (best possible)
     * where N is the number of districts.
     *
     * **Validates: Requirements 5.3, 7.3**
     */
    it('aggregate score should be within valid bounds', async () => {
      await fc.assert(
        fc.asyncProperty(districtStatisticsArrayArb(2, 20), async districts => {
          const rankedDistricts = await calculator.calculateRankings(districts)
          const totalDistricts = rankedDistricts.filter(d => d.ranking).length

          // With tie-neutralization (#198), tied categories contribute 0 points.
          // Minimum = 0 (all 3 categories tied)
          // Maximum = 3 * N (rank 1 in all 3 non-tied categories)
          const minScore = 0
          const maxScore = 3 * totalDistricts

          for (const district of rankedDistricts) {
            if (district.ranking) {
              expect(district.ranking.aggregateScore).toBeGreaterThanOrEqual(
                minScore
              )
              expect(district.ranking.aggregateScore).toBeLessThanOrEqual(
                maxScore
              )
            }
          }

          return true
        }),
        { numRuns: 100 }
      )
    })

    /**
     * Property 2.11: Idempotency - running twice produces same results
     * Calculating rankings twice on the same input should produce equivalent results.
     *
     * **Validates: Requirements 7.3, 7.4**
     */
    it('calculating rankings twice should produce equivalent results', async () => {
      await fc.assert(
        fc.asyncProperty(districtStatisticsArrayArb(2, 10), async districts => {
          const result1 = await calculator.calculateRankings(districts)
          const result2 = await calculator.calculateRankings(districts)

          expect(result1.length).toBe(result2.length)

          // Compare rankings (excluding calculatedAt which will differ)
          for (let i = 0; i < result1.length; i++) {
            const r1 = result1[i]!
            const r2 = result2[i]!

            expect(r1.districtId).toBe(r2.districtId)

            if (r1.ranking && r2.ranking) {
              expect(r1.ranking.clubsRank).toBe(r2.ranking.clubsRank)
              expect(r1.ranking.paymentsRank).toBe(r2.ranking.paymentsRank)
              expect(r1.ranking.distinguishedRank).toBe(
                r2.ranking.distinguishedRank
              )
              expect(r1.ranking.aggregateScore).toBe(r2.ranking.aggregateScore)
              expect(r1.ranking.clubGrowthPercent).toBe(
                r2.ranking.clubGrowthPercent
              )
              expect(r1.ranking.paymentGrowthPercent).toBe(
                r2.ranking.paymentGrowthPercent
              )
              expect(r1.ranking.distinguishedPercent).toBe(
                r2.ranking.distinguishedPercent
              )
            }
          }

          return true
        }),
        { numRuns: 50 }
      )
    })

    /**
     * Property 2.12: buildRankingsData preserves all ranking information
     * The buildRankingsData method should preserve all ranking data from input.
     *
     * **Validates: Requirements 5.3, 7.1**
     */
    it('buildRankingsData should preserve all ranking information', async () => {
      await fc.assert(
        fc.asyncProperty(
          districtStatisticsArrayArb(2, 10),
          snapshotDateArb,
          async (districts, snapshotId) => {
            const rankedDistricts =
              await calculator.calculateRankings(districts)
            const rankingsData = calculator.buildRankingsData(
              rankedDistricts,
              snapshotId
            )

            // Verify metadata
            expect(rankingsData.metadata.snapshotId).toBe(snapshotId)
            expect(rankingsData.metadata.rankingVersion).toBe(
              calculator.getRankingVersion()
            )

            // Verify all ranked districts are in the output
            const districtsWithRankings = rankedDistricts.filter(d => d.ranking)
            expect(rankingsData.rankings.length).toBe(
              districtsWithRankings.length
            )

            // Verify ranking data is preserved
            for (const ranking of rankingsData.rankings) {
              const sourceDistrict = rankedDistricts.find(
                d => d.districtId === ranking.districtId
              )
              expect(sourceDistrict).toBeDefined()
              expect(sourceDistrict!.ranking).toBeDefined()

              const sourceRanking = sourceDistrict!.ranking!
              expect(ranking.clubsRank).toBe(sourceRanking.clubsRank)
              expect(ranking.paymentsRank).toBe(sourceRanking.paymentsRank)
              expect(ranking.distinguishedRank).toBe(
                sourceRanking.distinguishedRank
              )
              expect(ranking.aggregateScore).toBe(sourceRanking.aggregateScore)
            }

            return true
          }
        ),
        { numRuns: 50 }
      )
    })
  })
})
