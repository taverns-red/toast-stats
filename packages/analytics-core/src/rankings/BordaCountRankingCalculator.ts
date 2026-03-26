/**
 * BordaCountRankingCalculator service for computing district rankings using Borda count system
 *
 * This service implements the sophisticated Borda count ranking algorithm that was
 * previously part of the legacy cache system. It calculates rankings across three
 * categories: club growth, payment growth, and distinguished club percentages.
 *
 * CRITICAL: This code is migrated from backend/src/services/RankingCalculator.ts,
 * not rewritten, to preserve bug fixes.
 *
 * @module @toastmasters/analytics-core/rankings
 */

import type {
  AllDistrictsRankingsData,
  AllDistrictsRankingsMetadata,
  DistrictRanking,
} from '@toastmasters/shared-contracts'

/**
 * Logger interface for ranking calculator.
 * Allows injection of custom logging implementation.
 */
export interface RankingLogger {
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, context?: Record<string, unknown>): void
  debug(message: string, context?: Record<string, unknown>): void
}

/**
 * Default no-op logger for when no logger is provided.
 */
const noopLogger: RankingLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

/**
 * Input district statistics for ranking calculation.
 * This interface matches the backend DistrictStatistics structure.
 */
export interface RankingDistrictStatistics {
  districtId: string
  asOfDate: string
  membership: {
    total: number
    change: number
    changePercent: number
    byClub: Array<{
      clubId: string
      clubName: string
      memberCount: number
    }>
    new?: number
    renewed?: number
    dual?: number
  }
  clubs: {
    total: number
    active: number
    suspended: number
    ineligible: number
    low: number
    distinguished: number
    chartered?: number
  }
  education: {
    totalAwards: number
    byType: Array<{ type: string; count: number }>
    topClubs: Array<{ clubId: string; clubName: string; awards: number }>
    byMonth?: Array<{ month: string; count: number }>
  }
  goals?: {
    clubsGoal: number
    membershipGoal: number
    distinguishedGoal: number
  }
  performance?: {
    membershipNet: number
    clubsNet: number
    distinguishedPercent: number
  }
  ranking?: DistrictRankingData
  districtPerformance?: Array<Record<string, string | number | null>>
  divisionPerformance?: Array<Record<string, string | number | null>>
  clubPerformance?: Array<Record<string, string | number | null>>
}

/**
 * District ranking data structure.
 */
export interface DistrictRankingData {
  // Individual category ranks (1 = best)
  clubsRank: number
  paymentsRank: number
  distinguishedRank: number

  // Aggregate Borda count score (higher = better)
  aggregateScore: number

  // Growth metrics used for ranking
  clubGrowthPercent: number
  paymentGrowthPercent: number
  distinguishedPercent: number

  // Base values for growth calculations
  paidClubBase: number
  paymentBase: number

  // Absolute values
  paidClubs: number
  totalPayments: number
  distinguishedClubs: number
  activeClubs: number
  selectDistinguished: number
  presidentsDistinguished: number

  // Regional information
  region: string
  districtName: string

  // Algorithm metadata
  rankingVersion: string
  calculatedAt: string
}

/**
 * Raw CSV data from getAllDistricts API call.
 */
export interface AllDistrictsCSVRecord {
  DISTRICT: string
  REGION: string
  'Paid Clubs': string
  'Paid Club Base': string
  '% Club Growth': string
  'Total YTD Payments': string
  'Payment Base': string
  '% Payment Growth': string
  'Active Clubs': string
  'Total Distinguished Clubs': string
  'Select Distinguished Clubs': string
  'Presidents Distinguished Clubs'?: string
  [key: string]: string | undefined
}

/**
 * Interface for ranking calculator.
 */
export interface IRankingCalculator {
  /**
   * Calculate rankings for all districts using Borda count system
   */
  calculateRankings(
    districts: RankingDistrictStatistics[]
  ): Promise<RankingDistrictStatistics[]>

  /**
   * Build AllDistrictsRankingsData from ranked districts
   * @param rankedDistricts - Districts with ranking data (output from calculateRankings)
   * @param snapshotId - The snapshot ID (date in YYYY-MM-DD format)
   * @returns AllDistrictsRankingsData structure ready to be written to all-districts-rankings.json
   */
  buildRankingsData(
    rankedDistricts: RankingDistrictStatistics[],
    snapshotId: string
  ): AllDistrictsRankingsData

  /**
   * Get the current ranking algorithm version
   */
  getRankingVersion(): string
}

/**
 * Internal structure for ranking metrics extraction
 */
interface RankingMetrics {
  districtId: string
  districtName: string
  region: string
  clubGrowthPercent: number
  paymentGrowthPercent: number
  distinguishedPercent: number
  paidClubs: number
  paidClubBase: number
  totalPayments: number
  paymentBase: number
  distinguishedClubs: number
  activeClubs: number
  selectDistinguished: number
  presidentsDistinguished: number
}

/**
 * Category ranking result
 */
interface CategoryRanking {
  districtId: string
  rank: number
  bordaPoints: number
  value: number
}

/**
 * Aggregate ranking result
 */
interface AggregateRanking {
  districtId: string
  clubsRank: number
  paymentsRank: number
  distinguishedRank: number
  aggregateScore: number
}

/**
 * Configuration options for BordaCountRankingCalculator.
 */
export interface BordaCountRankingCalculatorConfig {
  logger?: RankingLogger
}

/**
 * Borda Count Ranking Calculator implementation
 *
 * Implements the sophisticated ranking system using Borda count scoring:
 * - Ranks districts in three categories: club growth, payment growth, distinguished percentage
 * - Handles ties by assigning the same rank to districts with equal values
 * - Calculates Borda points: (total districts - rank + 1)
 * - Sums Borda points across categories for aggregate score
 * - Orders districts by aggregate score (highest first)
 *
 * CRITICAL: This code is migrated from backend/src/services/RankingCalculator.ts,
 * not rewritten, to preserve bug fixes.
 */
export class BordaCountRankingCalculator implements IRankingCalculator {
  private readonly RANKING_VERSION = '2.0'
  private readonly logger: RankingLogger

  constructor(config?: BordaCountRankingCalculatorConfig) {
    this.logger = config?.logger ?? noopLogger
  }

  /**
   * Calculate rankings for all districts using Borda count system
   */
  async calculateRankings(
    districts: RankingDistrictStatistics[]
  ): Promise<RankingDistrictStatistics[]> {
    const startTime = Date.now()
    const calculatedAt = new Date().toISOString()

    this.logger.info('Starting Borda count ranking calculation', {
      operation: 'calculateRankings',
      districtCount: districts.length,
      rankingVersion: this.RANKING_VERSION,
      calculatedAt,
    })

    try {
      if (districts.length === 0) {
        this.logger.warn('No districts provided for ranking calculation')
        return districts
      }

      // Step 1: Extract ranking metrics from district data
      const metrics = this.extractRankingMetrics(districts)
      this.logger.debug('Extracted ranking metrics', {
        operation: 'calculateRankings',
        metricsCount: metrics.length,
      })

      // Step 2: Calculate category rankings
      const clubRankings = this.calculateCategoryRanking(
        metrics,
        'clubGrowthPercent',
        'clubs'
      )
      const paymentRankings = this.calculateCategoryRanking(
        metrics,
        'paymentGrowthPercent',
        'payments'
      )
      const distinguishedRankings = this.calculateCategoryRanking(
        metrics,
        'distinguishedPercent',
        'distinguished'
      )

      this.logger.debug('Calculated category rankings', {
        operation: 'calculateRankings',
        clubRankings: clubRankings.length,
        paymentRankings: paymentRankings.length,
        distinguishedRankings: distinguishedRankings.length,
      })

      // Step 3: Calculate aggregate rankings
      const aggregateRankings = this.calculateAggregateRankings(
        clubRankings,
        paymentRankings,
        distinguishedRankings
      )

      this.logger.debug('Calculated aggregate rankings', {
        operation: 'calculateRankings',
        aggregateRankings: aggregateRankings.length,
      })

      // Step 4: Apply rankings to district data
      const rankedDistricts = this.applyRankingsToDistricts(
        districts,
        metrics,
        aggregateRankings,
        calculatedAt
      )

      // Step 5: Sort districts by aggregate score (highest first)
      const sortedDistricts = rankedDistricts.sort((a, b) => {
        const scoreA = a.ranking?.aggregateScore || 0
        const scoreB = b.ranking?.aggregateScore || 0
        return scoreB - scoreA
      })

      const duration = Date.now() - startTime
      this.logger.info('Completed Borda count ranking calculation', {
        operation: 'calculateRankings',
        districtCount: sortedDistricts.length,
        rankingVersion: this.RANKING_VERSION,
        durationMs: duration,
        calculatedAt,
      })

      return sortedDistricts
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'
      const duration = Date.now() - startTime

      this.logger.error('Ranking calculation failed', {
        operation: 'calculateRankings',
        error: errorMessage,
        districtCount: districts.length,
        durationMs: duration,
      })

      // Return original districts without ranking data on failure
      return districts
    }
  }

  /**
   * Get the current ranking algorithm version
   */
  getRankingVersion(): string {
    return this.RANKING_VERSION
  }

  /**
   * Build AllDistrictsRankingsData from ranked districts.
   * This method transforms the ranked district statistics into the file format
   * expected by all-districts-rankings.json.
   *
   * @param rankedDistricts - Districts with ranking data (output from calculateRankings)
   * @param snapshotId - The snapshot ID (date in YYYY-MM-DD format)
   * @returns AllDistrictsRankingsData structure ready to be written to all-districts-rankings.json
   */
  buildRankingsData(
    rankedDistricts: RankingDistrictStatistics[],
    snapshotId: string
  ): AllDistrictsRankingsData {
    const calculatedAt = new Date().toISOString()

    this.logger.info('Building rankings data structure', {
      operation: 'buildRankingsData',
      snapshotId,
      districtCount: rankedDistricts.length,
      rankingVersion: this.RANKING_VERSION,
    })

    // Build metadata
    const metadata: AllDistrictsRankingsMetadata = {
      snapshotId,
      calculatedAt,
      schemaVersion: '1.0',
      calculationVersion: '1.0',
      rankingVersion: this.RANKING_VERSION,
      sourceCsvDate: snapshotId, // Snapshot ID is the date
      csvFetchedAt: calculatedAt, // Use calculation time as fetch time
      totalDistricts: rankedDistricts.length,
      fromCache: false, // Rankings are freshly computed
    }

    // Filter districts with ranking data and sort by aggregate score (highest first)
    const districtsWithRankings = rankedDistricts
      .filter(district => district.ranking !== undefined)
      .sort((a, b) => {
        const scoreA = a.ranking?.aggregateScore ?? 0
        const scoreB = b.ranking?.aggregateScore ?? 0
        return scoreB - scoreA
      })

    // Build rankings array with pre-computed overallRank
    // overallRank is the position when sorted by aggregateScore (1 = best)
    const rankings: DistrictRanking[] = districtsWithRankings.map(
      (district, index) => {
        const ranking = district.ranking!
        return {
          districtId: district.districtId,
          districtName: ranking.districtName,
          region: ranking.region,
          paidClubs: ranking.paidClubs,
          paidClubBase: ranking.paidClubBase,
          clubGrowthPercent: ranking.clubGrowthPercent,
          totalPayments: ranking.totalPayments,
          paymentBase: ranking.paymentBase,
          paymentGrowthPercent: ranking.paymentGrowthPercent,
          activeClubs: ranking.activeClubs,
          distinguishedClubs: ranking.distinguishedClubs,
          selectDistinguished: ranking.selectDistinguished,
          presidentsDistinguished: ranking.presidentsDistinguished,
          distinguishedPercent: ranking.distinguishedPercent,
          clubsRank: ranking.clubsRank,
          paymentsRank: ranking.paymentsRank,
          distinguishedRank: ranking.distinguishedRank,
          aggregateScore: ranking.aggregateScore,
          overallRank: index + 1, // 1-indexed position based on aggregateScore
        }
      }
    )

    this.logger.info('Built rankings data structure', {
      operation: 'buildRankingsData',
      snapshotId,
      totalDistricts: rankings.length,
      rankingVersion: this.RANKING_VERSION,
    })

    return {
      metadata,
      rankings,
    }
  }

  /**
   * Extract ranking metrics from district statistics
   */
  private extractRankingMetrics(
    districts: RankingDistrictStatistics[]
  ): RankingMetrics[] {
    const metrics: RankingMetrics[] = []

    for (const district of districts) {
      try {
        // Extract metrics from the raw district performance data
        const districtPerformance = district.districtPerformance?.[0] as
          | AllDistrictsCSVRecord
          | undefined

        if (!districtPerformance) {
          this.logger.warn('No district performance data found', {
            districtId: district.districtId,
            operation: 'extractRankingMetrics',
          })
          continue
        }

        const metric: RankingMetrics = {
          districtId: district.districtId,
          districtName: districtPerformance.DISTRICT || district.districtId,
          region: districtPerformance.REGION || 'Unknown',
          clubGrowthPercent: this.parsePercentage(
            districtPerformance['% Club Growth']
          ),
          paymentGrowthPercent: this.parsePercentage(
            districtPerformance['% Payment Growth']
          ),
          distinguishedPercent:
            this.calculateDistinguishedPercent(districtPerformance),
          paidClubs: this.parseNumber(districtPerformance['Paid Clubs']),
          paidClubBase: this.parseNumber(districtPerformance['Paid Club Base']),
          totalPayments: this.parseNumber(
            districtPerformance['Total YTD Payments']
          ),
          paymentBase: this.parseNumber(districtPerformance['Payment Base']),
          distinguishedClubs: this.parseNumber(
            districtPerformance['Total Distinguished Clubs']
          ),
          activeClubs: this.parseNumber(districtPerformance['Active Clubs']),
          selectDistinguished: this.parseNumber(
            districtPerformance['Select Distinguished Clubs']
          ),
          presidentsDistinguished: this.parseNumber(
            districtPerformance['Presidents Distinguished Clubs']
          ),
        }

        metrics.push(metric)
      } catch (error) {
        this.logger.warn('Failed to extract metrics for district', {
          districtId: district.districtId,
          error: error instanceof Error ? error.message : 'Unknown error',
          operation: 'extractRankingMetrics',
        })
      }
    }

    return metrics
  }

  /**
   * Calculate distinguished club percentage from raw data
   */
  private calculateDistinguishedPercent(data: AllDistrictsCSVRecord): number {
    const distinguishedClubs = this.parseNumber(
      data['Total Distinguished Clubs']
    )
    const activeClubs = this.parseNumber(data['Active Clubs'])

    if (activeClubs === 0) {
      return 0
    }

    return (distinguishedClubs / activeClubs) * 100
  }

  /**
   * Calculate ranking for a single category
   */
  private calculateCategoryRanking(
    metrics: RankingMetrics[],
    valueField: keyof RankingMetrics,
    category: string
  ): CategoryRanking[] {
    // When all districts have the same value (e.g., 0% Distinguished pre-April),
    // the category provides no ranking differentiation. Award 0 Borda points
    // to avoid inflating all scores equally (#198).
    const uniqueValues = new Set(metrics.map(m => m[valueField] as number))
    if (uniqueValues.size === 1) {
      this.logger.debug(
        'All districts tied in category — awarding 0 Borda points',
        {
          category,
          totalDistricts: metrics.length,
          tiedValue: [...uniqueValues][0],
          operation: 'calculateCategoryRanking',
        }
      )
      return metrics.map(m => ({
        districtId: m.districtId,
        rank: 1,
        bordaPoints: 0,
        value: m[valueField] as number,
      }))
    }

    // Sort districts by value (highest first)
    const sortedMetrics = [...metrics].sort((a, b) => {
      const aValue = a[valueField] as number
      const bValue = b[valueField] as number
      return bValue - aValue
    })

    const rankings: CategoryRanking[] = []
    let currentRank = 1

    for (let i = 0; i < sortedMetrics.length; i++) {
      const metric = sortedMetrics[i]
      if (!metric) {
        continue
      }

      const value = metric[valueField] as number

      // Handle ties: if current value equals previous value, use same rank
      if (i > 0) {
        const previousMetric = sortedMetrics[i - 1]
        if (previousMetric) {
          const previousValue = previousMetric[valueField] as number
          if (value !== previousValue) {
            currentRank = i + 1
          }
        }
      }

      // Calculate Borda points: total districts - rank + 1
      const bordaPoints = metrics.length - currentRank + 1

      rankings.push({
        districtId: metric.districtId,
        rank: currentRank,
        bordaPoints,
        value,
      })
    }

    this.logger.debug('Calculated category ranking', {
      category,
      totalDistricts: metrics.length,
      uniqueRanks: new Set(rankings.map(r => r.rank)).size,
      operation: 'calculateCategoryRanking',
    })

    return rankings
  }

  /**
   * Calculate aggregate rankings by summing Borda points across categories
   */
  private calculateAggregateRankings(
    clubRankings: CategoryRanking[],
    paymentRankings: CategoryRanking[],
    distinguishedRankings: CategoryRanking[]
  ): AggregateRanking[] {
    const aggregateMap = new Map<string, AggregateRanking>()

    // Initialize aggregate rankings
    for (const ranking of clubRankings) {
      aggregateMap.set(ranking.districtId, {
        districtId: ranking.districtId,
        clubsRank: ranking.rank,
        paymentsRank: 0,
        distinguishedRank: 0,
        aggregateScore: ranking.bordaPoints,
      })
    }

    // Add payment rankings
    for (const ranking of paymentRankings) {
      const aggregate = aggregateMap.get(ranking.districtId)
      if (aggregate) {
        aggregate.paymentsRank = ranking.rank
        aggregate.aggregateScore += ranking.bordaPoints
      }
    }

    // Add distinguished rankings
    for (const ranking of distinguishedRankings) {
      const aggregate = aggregateMap.get(ranking.districtId)
      if (aggregate) {
        aggregate.distinguishedRank = ranking.rank
        aggregate.aggregateScore += ranking.bordaPoints
      }
    }

    // Sort by aggregate score (highest first)
    const sortedAggregates = Array.from(aggregateMap.values()).sort(
      (a, b) => b.aggregateScore - a.aggregateScore
    )

    this.logger.debug('Calculated aggregate rankings', {
      totalDistricts: sortedAggregates.length,
      highestScore: sortedAggregates[0]?.aggregateScore || 0,
      lowestScore:
        sortedAggregates[sortedAggregates.length - 1]?.aggregateScore || 0,
      operation: 'calculateAggregateRankings',
    })

    return sortedAggregates
  }

  /**
   * Apply calculated rankings to district statistics
   */
  private applyRankingsToDistricts(
    districts: RankingDistrictStatistics[],
    metrics: RankingMetrics[],
    aggregateRankings: AggregateRanking[],
    calculatedAt: string
  ): RankingDistrictStatistics[] {
    const metricsMap = new Map(metrics.map(m => [m.districtId, m]))
    const rankingsMap = new Map(aggregateRankings.map(r => [r.districtId, r]))

    return districts.map(district => {
      const metric = metricsMap.get(district.districtId)
      const ranking = rankingsMap.get(district.districtId)

      if (!metric || !ranking) {
        // Return district without ranking data if metrics/rankings are missing
        this.logger.warn('Missing metrics or rankings for district', {
          districtId: district.districtId,
          hasMetric: !!metric,
          hasRanking: !!ranking,
          operation: 'applyRankingsToDistricts',
        })
        return district
      }

      const rankingData: DistrictRankingData = {
        clubsRank: ranking.clubsRank,
        paymentsRank: ranking.paymentsRank,
        distinguishedRank: ranking.distinguishedRank,
        aggregateScore: ranking.aggregateScore,
        clubGrowthPercent: metric.clubGrowthPercent,
        paymentGrowthPercent: metric.paymentGrowthPercent,
        distinguishedPercent: metric.distinguishedPercent,
        paidClubBase: metric.paidClubBase,
        paymentBase: metric.paymentBase,
        paidClubs: metric.paidClubs,
        totalPayments: metric.totalPayments,
        distinguishedClubs: metric.distinguishedClubs,
        activeClubs: metric.activeClubs,
        selectDistinguished: metric.selectDistinguished,
        presidentsDistinguished: metric.presidentsDistinguished,
        region: metric.region,
        districtName: metric.districtName,
        rankingVersion: this.RANKING_VERSION,
        calculatedAt,
      }

      return {
        ...district,
        ranking: rankingData,
      }
    })
  }

  /**
   * Parse percentage string to number
   */
  private parsePercentage(value: string | number | null | undefined): number {
    if (typeof value === 'number') {
      return value
    }

    if (typeof value === 'string') {
      // Remove % sign and parse as float
      const cleaned = value.replace('%', '').trim()
      const parsed = parseFloat(cleaned)
      return isNaN(parsed) ? 0 : parsed
    }

    return 0
  }

  /**
   * Parse number from various input types
   */
  private parseNumber(value: string | number | null | undefined): number {
    if (typeof value === 'number') {
      return value
    }

    if (typeof value === 'string') {
      // Remove commas and parse as integer
      const cleaned = value.replace(/,/g, '').trim()
      const parsed = parseInt(cleaned, 10)
      return isNaN(parsed) ? 0 : parsed
    }

    return 0
  }
}
