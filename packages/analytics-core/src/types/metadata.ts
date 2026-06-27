/**
 * Metadata types for analytics computation.
 *
 * These types define metadata structures, date ranges, compute options,
 * and file/manifest wrappers used across the pre-computed analytics pipeline.
 */

import type { AllDistrictsRankingsData } from '@taverns-red/shared-contracts'

/**
 * Metadata included in every pre-computed analytics file.
 */
export interface AnalyticsMetadata {
  /** Schema version for compatibility checking */
  schemaVersion: string
  /** ISO timestamp when analytics were computed */
  computedAt: string
  /** Date of the snapshot used for computation (YYYY-MM-DD) */
  snapshotDate: string
  /** District identifier */
  districtId: string
  /** SHA256 checksum of the data field */
  checksum: string
  /** SHA256 checksum of the source snapshot file used for computation (Requirement 5.4) */
  sourceSnapshotChecksum?: string
}

/**
 * Date range for analytics.
 */
export interface DateRange {
  start: string
  end: string
}

/**
 * Options for analytics computation.
 */
export interface ComputeOptions {
  /** Force recomputation even if cached results exist */
  force?: boolean
  /** Enable verbose logging */
  verbose?: boolean
  /**
   * All-districts rankings data for computing per-metric rankings.
   * When provided, rankings (world rank, world percentile, region rank) will be
   * computed for each metric in performance targets.
   * Requirement 5.2: Pass all-districts rankings data to computePerformanceTargets
   */
  allDistrictsRankings?: AllDistrictsRankingsData
  /**
   * Pre-accumulated club trend history from the ClubTrendsStore (#144).
   * When provided, ClubHealthAnalyticsModule uses these trend arrays instead
   * of deriving them from the snapshots array. This allows dense trend data
   * (spanning the full program year) without needing to load all historical
   * snapshots on the ephemeral pipeline runner.
   *
   * Keys are clubIds. Values contain trend arrays sorted ascending by date.
   */
  preloadedClubTrends?: Record<
    string,
    {
      membershipTrend: Array<{ date: string; count: number }>
      dcpGoalsTrend: Array<{ date: string; goalsAchieved: number }>
    }
  >
}

/**
 * Pre-computed analytics file wrapper.
 * All analytics files follow this structure.
 */
export interface PreComputedAnalyticsFile<T> {
  metadata: AnalyticsMetadata
  data: T
}

/**
 * Analytics manifest entry for a single file.
 */
export interface AnalyticsManifestEntry {
  filename: string
  districtId: string
  type:
    | 'analytics'
    | 'membership'
    | 'clubhealth'
    | 'rankings'
    | 'membership-analytics'
    | 'vulnerable-clubs'
    | 'leadership-insights'
    | 'distinguished-analytics'
    | 'year-over-year'
    | 'performance-targets'
    | 'club-trends-index'
  size: number
  checksum: string
}

/**
 * Analytics manifest for a snapshot date.
 */
export interface AnalyticsManifest {
  snapshotDate: string
  generatedAt: string
  schemaVersion: string
  files: AnalyticsManifestEntry[]
  totalFiles: number
  totalSize: number
}
