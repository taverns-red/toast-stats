/**
 * Performance targets and rankings types.
 *
 * Types for recognition levels, recognition targets, metric targets,
 * region rank data, metric rankings, district performance targets,
 * and pre-computed performance targets data.
 */

/**
 * Recognition levels for district performance targets.
 * Ordered from lowest to highest achievement tier.
 * Moved from backend/src/types/analytics.ts to preserve hardened logic.
 *
 * Requirements: 7.2
 */
export type RecognitionLevel =
  | 'distinguished'
  | 'select'
  | 'presidents'
  | 'smedley'

/**
 * Target values for each recognition level.
 * All values are integers (ceiling-rounded from formulas).
 * Moved from backend/src/types/analytics.ts to preserve hardened logic.
 *
 * Requirements: 7.2
 */
export interface RecognitionTargets {
  distinguished: number
  select: number
  presidents: number
  smedley: number
}

/**
 * Target calculation result for a single metric.
 * Contains base value, current value, calculated targets, and achieved level.
 * Moved from backend/src/types/analytics.ts to preserve hardened logic.
 *
 * Requirements: 7.2
 */
export interface MetricTargets {
  /** Base value used for target calculation (null if unavailable) */
  base: number | null
  /** Current value of the metric */
  current: number
  /** Calculated targets for each recognition level (null if base unavailable) */
  targets: RecognitionTargets | null
  /** Highest recognition level achieved (null if none achieved or targets unavailable) */
  achievedLevel: RecognitionLevel | null
}

/**
 * Region ranking data for a single metric.
 * Moved from backend/src/types/analytics.ts to preserve hardened logic.
 *
 * Requirements: 7.2
 */
export interface RegionRankData {
  /** District's rank within its region (1 = best, null if unavailable) */
  regionRank: number | null
  /** Total number of districts in the region */
  totalInRegion: number
  /** Region identifier (null if unknown) */
  region: string | null
}

/**
 * Complete ranking data for a metric.
 * Includes world rank, percentile, and region rank.
 * Moved from backend/src/types/analytics.ts to preserve hardened logic.
 *
 * Requirements: 7.2
 */
export interface MetricRankings {
  /** District's world rank (1 = best, null if unavailable) */
  worldRank: number | null
  /** World percentile (0-100, rounded to 1 decimal, null if unavailable) */
  worldPercentile: number | null
  /** District's rank within its region (1 = best, null if unavailable) */
  regionRank: number | null
  /** Total number of districts worldwide */
  totalDistricts: number
  /** Total number of districts in the region */
  totalInRegion: number
  /** Region identifier (null if unknown) */
  region: string | null
}

/**
 * Performance targets and rankings for district overview.
 * Contains data for all three enhanced metric cards:
 * - Paid Clubs
 * - Membership Payments
 * - Distinguished Clubs
 *
 * Each metric includes current value, base value, calculated targets,
 * achieved recognition level, and complete ranking data.
 *
 * Moved from backend/src/types/analytics.ts to preserve hardened logic.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */
export interface DistrictPerformanceTargets {
  paidClubs: {
    current: number
    base: number | null
    targets: RecognitionTargets | null
    achievedLevel: RecognitionLevel | null
    rankings: MetricRankings
  }
  membershipPayments: {
    current: number
    base: number | null
    targets: RecognitionTargets | null
    achievedLevel: RecognitionLevel | null
    rankings: MetricRankings
  }
  distinguishedClubs: {
    current: number
    base: number | null // Uses Club_Base for percentage calculation
    targets: RecognitionTargets | null
    achievedLevel: RecognitionLevel | null
    rankings: MetricRankings
  }
}

// ========== Performance Targets Data Types (for pre-computed files) ==========

/**
 * Performance targets data structure for pre-computed files.
 * Pre-computed by collector-cli, served by backend.
 *
 * Contains recognition level targets (DAP, DDP) and progress tracking
 * for district performance metrics. Uses AreaDivisionRecognitionModule
 * to compute targets based on paid clubs and distinguished clubs percentages.
 *
 * Requirements: 7.1, 7.2
 */
export interface PerformanceTargetsData {
  /** District identifier */
  districtId: string
  /** ISO timestamp when the data was computed */
  computedAt: string
  /** Total count of paid clubs (clubs with "Active" status) */
  paidClubsCount: number
  /**
   * Current metric actuals. The recognition targets these are measured
   * against are the per-metric `*Targets` fields below (§13.2 semantics) —
   * the legacy scalar targets (membershipTarget / distinguishedTarget /
   * clubGrowthTarget) and projectedAchievement were removed in #1127.
   */
  currentProgress: {
    /** Current membership payments (official totalPayments when available) */
    membership: number
    /** Current distinguished clubs count */
    distinguished: number
    /** Current club growth (net change from base) */
    clubGrowth: number
  }
  /** Rankings for paid clubs metric (Requirements 4.1, 4.4) */
  paidClubsRankings: MetricRankings
  /** Rankings for membership payments metric (Requirements 4.2, 4.4) */
  membershipPaymentsRankings: MetricRankings
  /** Rankings for distinguished clubs metric (Requirements 4.3, 4.4) */
  distinguishedClubsRankings: MetricRankings

  // NEW: Base values from All Districts Rankings (Requirements 6.1, 6.2)
  /** Base value for paid clubs from All Districts Rankings (Requirement 6.1) */
  paidClubBase: number | null
  /** Base value for membership payments from All Districts Rankings (Requirement 6.2) */
  paymentBase: number | null

  // NEW: Recognition level targets (Requirements 6.3, 6.4, 6.5)
  /** Recognition level targets for paid clubs metric (Requirement 6.3) */
  paidClubsTargets: RecognitionTargets | null
  /** Recognition level targets for membership payments metric (Requirement 6.4) */
  membershipPaymentsTargets: RecognitionTargets | null
  /** Recognition level targets for distinguished clubs metric (Requirement 6.5) */
  distinguishedClubsTargets: RecognitionTargets | null

  // NEW: Achieved recognition levels (Requirements 6.6, 6.7, 6.8)
  /** Achieved recognition level for paid clubs metric (Requirement 6.6) */
  paidClubsAchievedLevel: RecognitionLevel | null
  /** Achieved recognition level for membership payments metric (Requirement 6.7) */
  membershipPaymentsAchievedLevel: RecognitionLevel | null
  /** Achieved recognition level for distinguished clubs metric (Requirement 6.8) */
  distinguishedClubsAchievedLevel: RecognitionLevel | null
}
