/**
 * Type definitions for district-related data structures
 */

export interface District {
  id: string
  name: string
}

export interface DistrictsResponse {
  districts: District[]
}

export interface MembershipHistoryPoint {
  date: string
  count: number
}

export interface MembershipHistoryResponse {
  data: MembershipHistoryPoint[]
}

export interface MembershipStats {
  total: number
  change: number
  changePercent: number
}

export interface ClubStats {
  total: number
  active: number
  suspended: number
  ineligible: number
  low: number
  distinguished: number
}

export interface AwardTypeCount {
  type: string
  count: number
}

export interface ClubAwards {
  clubId: string
  clubName: string
  awards: number
}

export interface MonthlyAwards {
  month: string
  count: number
}

export interface EducationStats {
  totalAwards: number
  byType: AwardTypeCount[]
  topClubs: ClubAwards[]
  byMonth: MonthlyAwards[]
}

export interface EducationalAwardsResponse {
  totalAwards: number
  byType: AwardTypeCount[]
  topClubs: ClubAwards[]
  byMonth: MonthlyAwards[]
}

export interface DistrictStatistics {
  districtId: string
  membership: MembershipStats
  clubs: ClubStats
  education: EducationStats

  // New ranking fields
  ranking?: DistrictRankingData

  // Raw data arrays from collector (for division/area performance cards)
  districtPerformance?: unknown[]
  divisionPerformance?: unknown[]
  clubPerformance?: unknown[]
}

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

export interface Club {
  id: string
  name: string
  status: 'active' | 'suspended' | 'ineligible' | 'low'
  memberCount: number
  distinguished: boolean
  distinguishedLevel?: 'select' | 'distinguished' | 'president'
  awards: number
}

export interface ClubsResponse {
  clubs: Club[]
}

// Daily Report Types

export interface Member {
  name: string
  clubId: string
  clubName: string
}

export interface ClubChange {
  clubId: string
  clubName: string
  changeType: 'chartered' | 'suspended' | 'reinstated' | 'closed'
  details?: string
}

export interface Award {
  type: string
  level?: string
  recipient: string
  clubId: string
  clubName: string
}

export interface DailyReportSummary {
  totalNewMembers: number
  totalRenewals: number
  totalAwards: number
  netMembershipChange: number
  dayOverDayChange: number
}

export interface DailyReport {
  date: string
  newMembers: Member[]
  renewals: Member[]
  clubChanges: ClubChange[]
  awards: Award[]
  summary: DailyReportSummary
}

export interface DailyReportsResponse {
  reports: Array<{
    date: string
    newMembers: number
    renewals: number
    clubChanges: Array<{ clubId: string; change: string }>
    awards: number
  }>
}

export type DailyReportDetailResponse = DailyReport

// Historical Rank Types

export interface HistoricalRankPoint {
  date: string
  aggregateScore: number
  clubsRank: number
  paymentsRank: number
  distinguishedRank: number
  totalDistricts: number
  /** Overall rank based on aggregateScore position (1 = best). Optional for backward compatibility with existing snapshots. */
  overallRank?: number
}

export interface DistrictRankHistory {
  districtId: string
  districtName: string
  history: HistoricalRankPoint[]
}

export interface ProgramYearInfo {
  startDate: string
  endDate: string
  year: string
}

export interface RankHistoryResponse {
  districtId: string
  districtName: string
  history: HistoricalRankPoint[]
  programYear: ProgramYearInfo
}

export interface AvailableDatesResponse {
  dates: Array<{
    date: string
    month: number
    day: number
    monthName: string
  }>
  programYear: ProgramYearInfo
}

// District Rankings Types (from shared-contracts)
export type { DistrictRanking } from '@taverns-red/shared-contracts'

export interface DistrictRankingsResponse {
  rankings: import('@taverns-red/shared-contracts').DistrictRanking[]
  date: string
}

// ========== Available Program Years Types (from shared-contracts) ==========

export type {
  ProgramYearWithData,
  AvailableRankingYearsResponse,
} from '@taverns-red/shared-contracts'

// ========== District Performance Targets Types ==========

/**
 * Recognition levels for district performance targets
 * Ordered from lowest to highest achievement tier
 */
export type RecognitionLevel =
  'distinguished' | 'select' | 'presidents' | 'smedley'

/**
 * Target values for each recognition level
 * All values are integers (ceiling-rounded from formulas)
 */
export interface RecognitionTargets {
  distinguished: number
  select: number
  presidents: number
  smedley: number
}

/**
 * Complete ranking data for a metric
 * Includes world rank, percentile, and region rank
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
 * Performance data for a single metric (paid clubs, membership payments, or distinguished clubs)
 */
export interface MetricPerformanceData {
  /** Current value of the metric */
  current: number
  /** Base value used for target calculation (null if unavailable) */
  base: number | null
  /** Calculated targets for each recognition level (null if base unavailable) */
  targets: RecognitionTargets | null
  /** Highest recognition level achieved (null if none achieved or targets unavailable) */
  achievedLevel: RecognitionLevel | null
  /** Ranking data for the metric */
  rankings: MetricRankings
}

/**
 * Performance targets and rankings for district overview
 * Contains data for all three enhanced metric cards:
 * - Paid Clubs (replaces Total Clubs)
 * - Membership Payments (replaces Total Membership)
 * - Distinguished Clubs (enhanced with targets)
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
export interface DistrictPerformanceTargets {
  /** Paid clubs performance data with targets and rankings */
  paidClubs: MetricPerformanceData
  /** Membership payments performance data with targets and rankings */
  membershipPayments: MetricPerformanceData
  /** Distinguished clubs performance data with targets and rankings */
  distinguishedClubs: MetricPerformanceData
}
