/**
 * Rankings module for analytics-core.
 *
 * Provides ranking computation algorithms for district statistics.
 *
 * @module @toastmasters/analytics-core/rankings
 */

export {
  BordaCountRankingCalculator,
  type IRankingCalculator,
  type RankingLogger,
  type RankingDistrictStatistics,
  type DistrictRankingData,
  type AllDistrictsCSVRecord,
  type BordaCountRankingCalculatorConfig,
} from './BordaCountRankingCalculator.js'

export {
  MetricRankingsCalculator,
  type MetricType,
  type RegionRankResult,
} from './MetricRankingsCalculator.js'

export {
  CompetitiveAwardsCalculator,
  type CompetitiveAwardRanking,
  type CompetitiveAwardsByDistrict,
  type CompetitiveAwardStandings,
} from './CompetitiveAwardsCalculator.js'
