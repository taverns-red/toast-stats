/**
 * TimeSeriesDataPointBuilder - Builds TimeSeriesDataPoint objects from district statistics.
 *
 * CRITICAL: This code is MIGRATED from backend/src/services/RefreshService.ts
 * to preserve all bug fixes and hardened logic. DO NOT REWRITE.
 *
 * The builder computes time-series data points from district statistics,
 * including membership totals, payment totals, DCP goals, club health counts,
 * and distinguished club totals.
 *
 * @module timeseries
 * @see Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
 */

import type {
  TimeSeriesDataPoint,
  ClubHealthCounts,
} from '@toastmasters/shared-contracts'
import { classifyClubHealth } from '../analytics/ClubEligibilityUtils.js'
import { getCurrentProgramMonth } from '../analytics/AnalyticsUtils.js'

/**
 * Scraped record type - represents raw CSV data with dynamic columns.
 * This matches the backend's ScrapedRecord type.
 */
export type ScrapedRecord = Record<string, string | number | null>

/**
 * Membership statistics structure.
 * Matches the backend's MembershipStats type.
 */
export interface MembershipStats {
  total: number
  change?: number
  changePercent?: number
}

/**
 * District statistics input type for the builder.
 * This interface matches the backend's DistrictStatistics structure
 * that contains the raw clubPerformance data needed for computation.
 *
 * Note: This is intentionally different from analytics-core's DistrictStatistics
 * which uses a transformed ClubStatistics[] structure.
 */
export interface DistrictStatisticsInput {
  /** District identifier */
  districtId: string
  /** Date of the statistics in YYYY-MM-DD format */
  asOfDate: string
  /** Optional membership statistics with total */
  membership?: MembershipStats
  /** Raw club performance data from CSV scraping */
  clubPerformance?: ScrapedRecord[]
}

/**
 * Builds TimeSeriesDataPoint objects from district statistics.
 *
 * MIGRATED from backend/src/services/RefreshService.ts
 * All logic is preserved exactly to maintain bug fixes.
 *
 * @see Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */
export class TimeSeriesDataPointBuilder {
  /**
   * Build a TimeSeriesDataPoint from district statistics.
   *
   * @param snapshotId - The snapshot identifier
   * @param district - The district statistics with raw clubPerformance data
   * @returns TimeSeriesDataPoint for the time-series index
   *
   * @see Requirements 6.1, 6.8
   */
  build(
    snapshotId: string,
    district: DistrictStatisticsInput
  ): TimeSeriesDataPoint {
    // Calculate total membership
    const membership = this.calculateTotalMembership(district)

    // Calculate total payments
    const payments = this.calculateTotalPayments(district)

    // Calculate total DCP goals
    const dcpGoals = this.calculateTotalDCPGoals(district)

    // Calculate club health counts
    const clubCounts = this.calculateClubHealthCounts(district)

    // Calculate distinguished club total
    const distinguishedTotal = this.calculateDistinguishedTotal(district)

    return {
      date: district.asOfDate,
      snapshotId,
      membership,
      payments,
      dcpGoals,
      distinguishedTotal,
      clubCounts,
    }
  }

  /**
   * Calculate total membership from district statistics.
   *
   * MIGRATED from RefreshService.calculateTotalMembership
   *
   * @param district - The district statistics
   * @returns Total membership count
   *
   * @see Requirements 6.3
   */
  calculateTotalMembership(district: DistrictStatisticsInput): number {
    // Primary: Use membership.total if available
    if (district.membership?.total !== undefined) {
      return district.membership.total
    }

    // Fallback: Sum from club performance data
    if (district.clubPerformance && district.clubPerformance.length > 0) {
      return district.clubPerformance.reduce((total, club) => {
        const membership = this.parseIntSafe(
          club['Active Members'] ??
            club['Active Membership'] ??
            club['Membership']
        )
        return total + membership
      }, 0)
    }

    return 0
  }

  /**
   * Calculate total payments from district statistics.
   *
   * MIGRATED from RefreshService.calculateTotalPayments
   *
   * @param district - The district statistics
   * @returns Total payments count
   *
   * @see Requirements 6.4
   */
  calculateTotalPayments(district: DistrictStatisticsInput): number {
    const clubs = district.clubPerformance ?? []

    return clubs.reduce((total, club) => {
      const octRenewals = this.parseIntSafe(
        club['Oct. Ren.'] ?? club['Oct. Ren']
      )
      const aprRenewals = this.parseIntSafe(
        club['Apr. Ren.'] ?? club['Apr. Ren']
      )
      const newMembers = this.parseIntSafe(club['New Members'] ?? club['New'])

      return total + octRenewals + aprRenewals + newMembers
    }, 0)
  }

  /**
   * Calculate total DCP goals from district statistics.
   *
   * MIGRATED from RefreshService.calculateTotalDCPGoals
   *
   * @param district - The district statistics
   * @returns Total DCP goals count
   *
   * @see Requirements 6.5
   */
  calculateTotalDCPGoals(district: DistrictStatisticsInput): number {
    const clubs = district.clubPerformance ?? []

    return clubs.reduce((total, club) => {
      const goals = this.parseIntSafe(club['Goals Met'])
      return total + goals
    }, 0)
  }

  /**
   * Calculate club health counts from district statistics.
   *
   * Delegates per-club classification to the shared classifyClubHealth
   * (#1120) so these counts cannot drift from the dashboard's
   * ClubHealthAnalyticsModule.assessClubHealth:
   * - Intervention Required: membership < 12 AND net growth < 3
   * - Thriving: (membership >= 20 OR net growth >= 3) AND the §5.3
   *   monthly DCP checkpoint is met AND CSP is submitted
   * - Vulnerable: All other clubs
   *
   * @param district - The district statistics
   * @returns Club health counts breakdown
   *
   * @see Requirements 6.6
   */
  calculateClubHealthCounts(
    district: DistrictStatisticsInput
  ): ClubHealthCounts {
    const clubs = district.clubPerformance ?? []
    const total = clubs.length
    const month = getCurrentProgramMonth(district.asOfDate)

    let thriving = 0
    let vulnerable = 0
    let interventionRequired = 0

    for (const club of clubs) {
      const membership = this.parseIntSafe(
        club['Active Members'] ??
          club['Active Membership'] ??
          club['Membership']
      )
      const dcpGoals = this.parseIntSafe(club['Goals Met'])
      const memBase = this.parseIntSafe(club['Mem. Base'])

      const { status } = classifyClubHealth(
        {
          membership,
          membershipBase: memBase,
          dcpGoals,
          cspSubmitted: this.parseCspSubmitted(club),
        },
        month
      )

      if (status === 'intervention-required') {
        interventionRequired++
      } else if (status === 'thriving') {
        thriving++
      } else {
        vulnerable++
      }
    }

    return {
      total,
      thriving,
      vulnerable,
      interventionRequired,
    }
  }

  /**
   * Parse CSP (Club Success Plan) submission status from a raw record.
   *
   * Historical compatibility: when the field is absent (pre-2025-2026
   * CSVs), CSP is treated as submitted — it was not a requirement then.
   *
   * @param club - The club record
   * @returns True unless the field is present and explicitly negative
   */
  parseCspSubmitted(club: ScrapedRecord): boolean {
    const cspValue =
      club['CSP'] ??
      club['Club Success Plan'] ??
      club['CSP Submitted'] ??
      club['Club Success Plan Submitted']

    if (cspValue === undefined || cspValue === null) {
      return true
    }

    const cspString = String(cspValue).toLowerCase().trim()
    return !(
      cspString === 'no' ||
      cspString === 'false' ||
      cspString === '0' ||
      cspString === 'not submitted' ||
      cspString === 'n'
    )
  }

  /**
   * Calculate total distinguished clubs from district statistics.
   *
   * MIGRATED from RefreshService.calculateDistinguishedTotal
   *
   * @param district - The district statistics
   * @returns Total distinguished clubs count
   *
   * @see Requirements 6.7
   */
  calculateDistinguishedTotal(district: DistrictStatisticsInput): number {
    const clubs = district.clubPerformance ?? []
    let total = 0

    for (const club of clubs) {
      if (this.isDistinguished(club)) {
        total++
      }
    }

    return total
  }

  /**
   * Check if a club qualifies as distinguished.
   *
   * MIGRATED from RefreshService.isDistinguished
   *
   * A club is distinguished if:
   * 1. CSP (Club Success Plan) is submitted (or field doesn't exist for historical compatibility)
   * 2. Either:
   *    a. Club Distinguished Status field indicates distinguished level, OR
   *    b. Has 5+ DCP goals AND (20+ members OR net growth of 3+)
   *
   * @param club - The club record
   * @returns True if the club is distinguished
   *
   * @see Requirements 6.7
   */
  isDistinguished(club: ScrapedRecord): boolean {
    // Check CSP status first
    const cspValue =
      club['CSP'] ??
      club['Club Success Plan'] ??
      club['CSP Submitted'] ??
      club['Club Success Plan Submitted']

    // Historical data compatibility: if field doesn't exist, assume submitted
    if (cspValue !== undefined && cspValue !== null) {
      const cspString = String(cspValue).toLowerCase().trim()
      if (
        cspString === 'no' ||
        cspString === 'false' ||
        cspString === '0' ||
        cspString === 'not submitted' ||
        cspString === 'n'
      ) {
        return false
      }
    }

    // Check Club Distinguished Status field
    const statusField = club['Club Distinguished Status']
    if (statusField !== null && statusField !== undefined) {
      const status = String(statusField).toLowerCase().trim()
      if (
        status !== '' &&
        status !== 'none' &&
        status !== 'n/a' &&
        (status.includes('smedley') ||
          status.includes('president') ||
          status.includes('select') ||
          status.includes('distinguished'))
      ) {
        return true
      }
    }

    // Fallback: Calculate based on DCP goals, membership, and net growth
    const dcpGoals = this.parseIntSafe(club['Goals Met'])
    const membership = this.parseIntSafe(
      club['Active Members'] ?? club['Active Membership'] ?? club['Membership']
    )
    const memBase = this.parseIntSafe(club['Mem. Base'])
    const netGrowth = membership - memBase

    // Distinguished: 5+ goals + (20 members OR net growth of 3)
    return dcpGoals >= 5 && (membership >= 20 || netGrowth >= 3)
  }

  /**
   * Parse an integer value safely, returning 0 for invalid values.
   *
   * MIGRATED from RefreshService.parseIntSafe
   *
   * @param value - The value to parse
   * @returns Parsed integer or 0 if invalid
   *
   * @see Requirements 6.2
   */
  parseIntSafe(value: string | number | null | undefined): number {
    if (value === null || value === undefined || value === '') {
      return 0
    }
    if (typeof value === 'number') {
      return isNaN(value) ? 0 : Math.floor(value)
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed === '') {
        return 0
      }
      const parsed = parseInt(trimmed, 10)
      return isNaN(parsed) ? 0 : parsed
    }
    return 0
  }
}
