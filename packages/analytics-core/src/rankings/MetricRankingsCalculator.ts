/**
 * MetricRankingsCalculator service for computing per-metric rankings from all-districts rankings data.
 *
 * This service extracts world rank from existing all-districts-rankings.json data,
 * calculates world percentile, and computes region rank by filtering and ranking
 * within region subsets.
 *
 * The key insight is that we don't recompute world rankings - we reuse the existing
 * clubsRank, paymentsRank, and distinguishedRank from all-districts-rankings.json.
 *
 * @module @taverns-red/analytics-core/rankings
 */

import type {
  AllDistrictsRankingsData,
  DistrictRanking,
} from '@taverns-red/shared-contracts'
import type { MetricRankings } from '../types.js'

/**
 * Supported metric types for ranking calculations.
 */
export type MetricType = 'clubs' | 'payments' | 'distinguished'

/**
 * Result of region rank calculation.
 */
export interface RegionRankResult {
  /** District's rank within its region (1 = best, null if unavailable) */
  regionRank: number | null
  /** Total number of districts in the region */
  totalInRegion: number
  /** Region identifier (null if unknown) */
  region: string | null
}

/**
 * Creates null/empty rankings for when data is unavailable.
 */
function createNullRankings(): MetricRankings {
  return {
    worldRank: null,
    worldPercentile: null,
    regionRank: null,
    totalDistricts: 0,
    totalInRegion: 0,
    region: null,
  }
}

/**
 * Extracts the metric value from a DistrictRanking based on metric type.
 * Used for sorting districts within a region.
 *
 * @param ranking - The district ranking data
 * @param metric - The metric type to extract
 * @returns The metric value (percentage for growth metrics)
 */
function getMetricValue(ranking: DistrictRanking, metric: MetricType): number {
  switch (metric) {
    case 'clubs':
      return ranking.clubGrowthPercent
    case 'payments':
      return ranking.paymentGrowthPercent
    case 'distinguished':
      return ranking.distinguishedPercent
  }
}

/**
 * Extracts the world rank from a DistrictRanking based on metric type.
 *
 * @param ranking - The district ranking data
 * @param metric - The metric type to extract rank for
 * @returns The world rank (1 = best)
 */
function getWorldRank(ranking: DistrictRanking, metric: MetricType): number {
  switch (metric) {
    case 'clubs':
      return ranking.clubsRank
    case 'payments':
      return ranking.paymentsRank
    case 'distinguished':
      return ranking.distinguishedRank
  }
}

/**
 * Checks if a region value is valid (not null, undefined, empty, or "Unknown").
 *
 * @param region - The region value to check
 * @returns true if the region is valid
 */
function isValidRegion(region: string | null | undefined): region is string {
  return (
    region !== null &&
    region !== undefined &&
    region !== '' &&
    region !== 'Unknown'
  )
}

/**
 * MetricRankingsCalculator computes per-metric rankings from all-districts rankings data.
 *
 * This calculator:
 * 1. Extracts world rank from existing clubsRank, paymentsRank, or distinguishedRank
 * 2. Calculates world percentile using the formula: ((totalDistricts - worldRank) / totalDistricts) * 100
 * 3. Computes region rank by filtering districts by region and ranking by metric value
 * 4. Handles ties by assigning the same rank to districts with equal metric values
 *
 * Requirements: 1.1-1.5, 2.1-2.4, 3.1-3.5, 6.1
 */
export class MetricRankingsCalculator {
  /**
   * Calculate world percentile from rank and total districts.
   *
   * Formula: ((totalDistricts - worldRank) / totalDistricts) * 100
   * Rounded to 1 decimal place.
   *
   * @param worldRank - The district's world rank (1 = best)
   * @param totalDistricts - Total number of districts worldwide
   * @returns World percentile (0-100) or null if calculation is not possible
   *
   * Requirements: 2.1, 2.2, 2.3, 2.4
   */
  calculateWorldPercentile(
    worldRank: number | null,
    totalDistricts: number
  ): number | null {
    // Requirement 2.4: If worldRank is null, return null
    if (worldRank === null) {
      return null
    }

    // Requirement 2.3: If totalDistricts is 0 or 1, return null
    if (totalDistricts <= 1) {
      return null
    }

    // Requirement 2.1: Calculate percentile using formula
    const percentile = ((totalDistricts - worldRank) / totalDistricts) * 100

    // Requirement 2.2: Round to 1 decimal place
    return Math.round(percentile * 10) / 10
  }

  /**
   * Calculate region rank for a district within its region.
   *
   * Districts are ranked from highest to lowest metric value (1 = best).
   * Ties are handled by assigning the same rank to districts with equal values.
   *
   * @param districtId - The district to calculate region rank for
   * @param metric - The metric type ('clubs', 'payments', or 'distinguished')
   * @param allDistrictsRankings - The all-districts rankings data
   * @returns Region rank result with regionRank, totalInRegion, and region
   *
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.1
   */
  calculateRegionRank(
    districtId: string,
    metric: MetricType,
    allDistrictsRankings: AllDistrictsRankingsData
  ): RegionRankResult {
    // Find the target district
    const targetDistrict = allDistrictsRankings.rankings.find(
      r => r.districtId === districtId
    )

    // If district not found, return null rankings
    if (!targetDistrict) {
      return {
        regionRank: null,
        totalInRegion: 0,
        region: null,
      }
    }

    // Requirement 3.3: Extract region from all-districts-rankings.json
    const districtRegion = targetDistrict.region

    // Requirement 3.4: If region is "Unknown" or not available, return null
    if (!isValidRegion(districtRegion)) {
      return {
        regionRank: null,
        totalInRegion: 0,
        region: null,
      }
    }

    // Requirement 3.1: Filter districts by same region value
    const districtsInRegion = allDistrictsRankings.rankings.filter(
      r => isValidRegion(r.region) && r.region === districtRegion
    )

    // Requirement 3.5: Set totalInRegion to count of districts with same region
    const totalInRegion = districtsInRegion.length

    // Requirement 3.2: Rank districts within region from highest to lowest metric value
    // Sort by metric value descending (highest first, 1 = best)
    const sortedDistricts = [...districtsInRegion].sort((a, b) => {
      const valueA = getMetricValue(a, metric)
      const valueB = getMetricValue(b, metric)
      return valueB - valueA
    })

    // Requirement 6.1: Handle ties - assign same rank to districts with equal values
    let regionRank: number | null = null
    let currentRank = 1

    for (let i = 0; i < sortedDistricts.length; i++) {
      const district = sortedDistricts[i]
      if (!district) continue

      // Handle ties: if current value equals previous value, use same rank
      if (i > 0) {
        const previousDistrict = sortedDistricts[i - 1]
        if (previousDistrict) {
          const currentValue = getMetricValue(district, metric)
          const previousValue = getMetricValue(previousDistrict, metric)
          if (currentValue !== previousValue) {
            currentRank = i + 1
          }
        }
      }

      // Check if this is our target district
      if (district.districtId === districtId) {
        regionRank = currentRank
        break
      }
    }

    return {
      regionRank,
      totalInRegion,
      region: districtRegion,
    }
  }

  /**
   * Calculate complete metric rankings for a specific district and metric.
   *
   * This method combines world rank extraction, world percentile calculation,
   * and region rank computation into a single MetricRankings result.
   *
   * @param districtId - The district to calculate rankings for
   * @param metric - The metric type ('clubs', 'payments', or 'distinguished')
   * @param allDistrictsRankings - The all-districts rankings data
   * @returns Complete MetricRankings object
   *
   * Requirements: 1.1-1.5, 2.1-2.4, 3.1-3.5, 6.1
   */
  calculateMetricRankings(
    districtId: string,
    metric: MetricType,
    allDistrictsRankings: AllDistrictsRankingsData
  ): MetricRankings {
    // Find the target district in rankings
    const targetDistrict = allDistrictsRankings.rankings.find(
      r => r.districtId === districtId
    )

    // Requirement 1.5: If district not found, return null rankings
    if (!targetDistrict) {
      return createNullRankings()
    }

    // Get total districts from metadata
    const totalDistricts = allDistrictsRankings.metadata.totalDistricts

    // Requirements 1.2, 1.3, 1.4: Extract world rank from appropriate field
    const worldRank = getWorldRank(targetDistrict, metric)

    // Requirements 2.1-2.4: Calculate world percentile
    const worldPercentile = this.calculateWorldPercentile(
      worldRank,
      totalDistricts
    )

    // Requirements 3.1-3.5, 6.1: Calculate region rank
    const regionRankResult = this.calculateRegionRank(
      districtId,
      metric,
      allDistrictsRankings
    )

    return {
      worldRank,
      worldPercentile,
      regionRank: regionRankResult.regionRank,
      totalDistricts,
      totalInRegion: regionRankResult.totalInRegion,
      region: regionRankResult.region,
    }
  }
}
