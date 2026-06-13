/**
 * Membership Analytics Module
 *
 * Handles membership trends, year-over-year comparisons, seasonal patterns,
 * and membership projections.
 *
 * This module contains the hardened backend logic adapted to work with
 * DistrictStatistics[] instead of IAnalyticsDataSource.
 *
 * Key features:
 * - generateMembershipAnalytics() returning full MembershipAnalytics type
 * - Seasonal patterns analysis (identifySeasonalPatterns)
 * - Program year change calculation (calculateProgramYearChange)
 * - Top growth/declining clubs analysis
 * - Year-over-year membership comparison
 *
 * Requirements: 1.1, 1.2
 */

import type { DistrictStatistics } from '../interfaces.js'
import { selectPreviousProgramYearSnapshot } from './AnalyticsUtils.js'
import type {
  MembershipTrendPoint,
  PaymentsTrendPoint,
  YearOverYearComparison,
  MembershipTrendData,
  MembershipAnalytics,
  SeasonalPattern,
  MembershipYearOverYearComparison,
  GrowthVelocity,
} from '../types.js'

/**
 * Internal club trend structure for membership analysis
 */
interface ClubMembershipTrend {
  clubId: string
  clubName: string
  membershipTrend: Array<{ date: string; count: number }>
  dcpGoalsTrend: Array<{ date: string; goalsAchieved: number }>
}

/**
 * MembershipAnalyticsModule
 *
 * Specialized module for membership-related analytics calculations.
 * Works directly with DistrictStatistics data without external dependencies.
 * Stateless module - no constructor required.
 *
 * Requirements: 1.1, 1.2
 */
export class MembershipAnalyticsModule {
  /**
   * Generate comprehensive membership analytics from snapshots
   *
   * This is the main entry point for membership analytics computation.
   * Adapted from backend MembershipAnalyticsModule.generateMembershipAnalytics()
   * to work with DistrictStatistics[] instead of IAnalyticsDataSource.
   *
   * @param districtId - The district ID to analyze
   * @param snapshots - Array of district statistics snapshots (sorted by date ascending)
   * @returns MembershipAnalytics object
   */
  generateMembershipAnalytics(
    districtId: string,
    snapshots: DistrictStatistics[]
  ): MembershipAnalytics {
    if (snapshots.length === 0) {
      return {
        totalMembership: 0,
        membershipChange: 0,
        programYearChange: 0,
        membershipTrend: [],
        topGrowthClubs: [],
        topDecliningClubs: [],
        seasonalPatterns: [],
        yearOverYearComparison: undefined,
      }
    }

    // Filter snapshots for the requested district
    const districtSnapshots = snapshots.filter(s => s.districtId === districtId)

    if (districtSnapshots.length === 0) {
      return {
        totalMembership: 0,
        membershipChange: 0,
        programYearChange: 0,
        membershipTrend: [],
        topGrowthClubs: [],
        topDecliningClubs: [],
        seasonalPatterns: [],
        yearOverYearComparison: undefined,
      }
    }

    // Calculate membership trend over time
    const membershipTrend =
      this.calculateMembershipTrendInternal(districtSnapshots)
    const totalMembership =
      membershipTrend[membershipTrend.length - 1]?.count ?? 0
    const membershipChange =
      this.calculateMembershipChangeInternal(membershipTrend)

    // Calculate program year change
    const programYearChange = this.calculateProgramYearChange(membershipTrend)

    // Analyze club trends to identify top growth and declining clubs
    const clubTrends = this.analyzeClubTrendsInternal(districtSnapshots)
    const topGrowthClubs = this.calculateTopGrowthClubsInternal(clubTrends)
    const topDecliningClubs =
      this.calculateTopDecliningClubsInternal(clubTrends)

    // Identify seasonal patterns
    const seasonalPatterns = this.identifySeasonalPatterns(membershipTrend)

    // Calculate year-over-year comparison if data available
    const yearOverYearComparison = this.calculateMembershipYearOverYear(
      districtSnapshots,
      membershipTrend
    )

    // Calculate growth velocity (#219)
    const growthVelocity = this.calculateGrowthVelocity(membershipTrend)

    return {
      totalMembership,
      membershipChange,
      programYearChange,
      membershipTrend,
      topGrowthClubs,
      topDecliningClubs,
      seasonalPatterns,
      yearOverYearComparison,
      growthVelocity,
    }
  }

  /**
   * Generate comprehensive membership trend data from snapshots
   * (Preserved from original analytics-core version for backward compatibility)
   *
   * @param snapshots - Array of district statistics snapshots (sorted by date ascending)
   * @returns MembershipTrendData object
   */
  generateMembershipTrends(
    snapshots: DistrictStatistics[]
  ): MembershipTrendData {
    if (snapshots.length === 0) {
      return {
        membershipTrend: [],
        paymentsTrend: [],
      }
    }

    // Calculate membership trend over time
    const membershipTrend = this.calculateMembershipTrend(snapshots)
    const paymentsTrend = this.calculatePaymentsTrend(snapshots)

    // Calculate year-over-year comparison if data available
    const yearOverYear = this.calculateYearOverYear(snapshots)

    return {
      membershipTrend,
      paymentsTrend,
      yearOverYear,
    }
  }

  /**
   * Get total membership from a snapshot
   *
   * @param snapshot - District statistics snapshot
   * @returns Total membership count
   */
  getTotalMembership(snapshot: DistrictStatistics): number {
    return snapshot.clubs.reduce((sum, club) => sum + club.membershipCount, 0)
  }

  /**
   * Get total payments from a snapshot
   *
   * @param snapshot - District statistics snapshot
   * @returns Total payments count
   */
  getTotalPayments(snapshot: DistrictStatistics): number {
    return snapshot.clubs.reduce((sum, club) => sum + club.paymentsCount, 0)
  }

  /**
   * Calculate membership change between first and last snapshot
   *
   * @param snapshots - Array of district statistics snapshots
   * @returns Membership change (positive = growth, negative = decline)
   */
  calculateMembershipChange(snapshots: DistrictStatistics[]): number {
    if (snapshots.length < 2) {
      return 0
    }
    const first = snapshots[0]
    const last = snapshots[snapshots.length - 1]
    if (!first || !last) {
      return 0
    }
    return this.getTotalMembership(last) - this.getTotalMembership(first)
  }

  /**
   * Calculate top growth clubs
   *
   * @param snapshots - Array of district statistics snapshots
   * @param limit - Maximum number of clubs to return (default: 10)
   * @returns Array of clubs with positive growth, sorted by growth descending
   */
  calculateTopGrowthClubs(
    snapshots: DistrictStatistics[],
    limit = 10
  ): Array<{ clubId: string; clubName: string; growth: number }> {
    const clubTrends = this.analyzeClubTrends(snapshots)

    return clubTrends
      .map(club => {
        if (club.membershipTrend.length < 2) {
          return { clubId: club.clubId, clubName: club.clubName, growth: 0 }
        }

        const first = club.membershipTrend[0]?.count ?? 0
        const last =
          club.membershipTrend[club.membershipTrend.length - 1]?.count ?? 0
        const growth = last - first

        return { clubId: club.clubId, clubName: club.clubName, growth }
      })
      .filter(club => club.growth > 0)
      .sort((a, b) => b.growth - a.growth)
      .slice(0, limit)
  }

  /**
   * Calculate top declining clubs
   *
   * @param snapshots - Array of district statistics snapshots
   * @param limit - Maximum number of clubs to return (default: 10)
   * @returns Array of clubs with decline, sorted by decline descending
   */
  calculateTopDecliningClubs(
    snapshots: DistrictStatistics[],
    limit = 10
  ): Array<{ clubId: string; clubName: string; decline: number }> {
    const clubTrends = this.analyzeClubTrends(snapshots)

    return clubTrends
      .map(club => {
        if (club.membershipTrend.length < 2) {
          return { clubId: club.clubId, clubName: club.clubName, decline: 0 }
        }

        const first = club.membershipTrend[0]?.count ?? 0
        const last =
          club.membershipTrend[club.membershipTrend.length - 1]?.count ?? 0
        const decline = first - last // Positive value means decline

        return { clubId: club.clubId, clubName: club.clubName, decline }
      })
      .filter(club => club.decline > 0)
      .sort((a, b) => b.decline - a.decline)
      .slice(0, limit)
  }

  // ========== Growth Velocity (#219) ==========

  /**
   * Calculate growth velocity from membership trend data.
   *
   * Velocity = average change per interval (members/month).
   * Acceleration = change in velocity between first half and second half.
   * Trend = 'accelerating' if acceleration > threshold, 'decelerating' if < -threshold.
   *
   * @param membershipTrend - Array of {date, count} data points (sorted by date)
   * @returns GrowthVelocity with velocity, acceleration, and trend
   */
  calculateGrowthVelocity(
    membershipTrend: Array<{ date: string; count: number }>
  ): GrowthVelocity {
    const stable: GrowthVelocity = {
      velocity: 0,
      acceleration: 0,
      trend: 'stable',
    }

    if (membershipTrend.length < 2) {
      return stable
    }

    // Calculate per-interval deltas
    const deltas: number[] = []
    for (let i = 1; i < membershipTrend.length; i++) {
      const prev = membershipTrend[i - 1]
      const curr = membershipTrend[i]
      if (prev && curr) {
        deltas.push(curr.count - prev.count)
      }
    }

    if (deltas.length === 0) {
      return stable
    }

    // Velocity = average delta per interval
    const velocity =
      Math.round((deltas.reduce((sum, d) => sum + d, 0) / deltas.length) * 10) /
      10

    // Acceleration: compare first-half avg velocity to second-half avg velocity
    let acceleration = 0
    let trend: GrowthVelocity['trend'] = 'stable'

    if (deltas.length >= 2) {
      const mid = Math.floor(deltas.length / 2)
      const firstHalf = deltas.slice(0, mid)
      const secondHalf = deltas.slice(mid)

      const firstAvg =
        firstHalf.reduce((sum, d) => sum + d, 0) / firstHalf.length
      const secondAvg =
        secondHalf.reduce((sum, d) => sum + d, 0) / secondHalf.length

      acceleration = Math.round((secondAvg - firstAvg) * 10) / 10

      // Threshold: acceleration must exceed 1 member/month change to be significant
      if (acceleration > 1) {
        trend = 'accelerating'
      } else if (acceleration < -1) {
        trend = 'decelerating'
      }
    }

    return { velocity, acceleration, trend }
  }

  // ========== MembershipAnalytics-specific Private Methods ==========

  /**
   * Calculate membership trend over time (internal version for MembershipAnalytics)
   */
  private calculateMembershipTrendInternal(
    snapshots: DistrictStatistics[]
  ): Array<{ date: string; count: number }> {
    return snapshots.map(snapshot => ({
      date: snapshot.snapshotDate,
      count: this.getTotalMembership(snapshot),
    }))
  }

  /**
   * Calculate membership change (internal version for MembershipAnalytics)
   */
  private calculateMembershipChangeInternal(
    membershipTrend: Array<{ date: string; count: number }>
  ): number {
    if (membershipTrend.length < 2) {
      return 0
    }
    const first = membershipTrend[0]?.count ?? 0
    const last = membershipTrend[membershipTrend.length - 1]?.count ?? 0
    return last - first
  }

  /**
   * Calculate top growth clubs (internal version for MembershipAnalytics)
   */
  private calculateTopGrowthClubsInternal(
    clubTrends: ClubMembershipTrend[]
  ): Array<{ clubId: string; clubName: string; growth: number }> {
    const growthClubs = clubTrends
      .map(club => {
        if (club.membershipTrend.length < 2) {
          return { clubId: club.clubId, clubName: club.clubName, growth: 0 }
        }

        const first = club.membershipTrend[0]?.count ?? 0
        const last =
          club.membershipTrend[club.membershipTrend.length - 1]?.count ?? 0
        const growth = last - first

        return { clubId: club.clubId, clubName: club.clubName, growth }
      })
      .filter(club => club.growth > 0)
      .sort((a, b) => b.growth - a.growth)
      .slice(0, 10)

    return growthClubs
  }

  /**
   * Calculate top declining clubs (internal version for MembershipAnalytics)
   */
  private calculateTopDecliningClubsInternal(
    clubTrends: ClubMembershipTrend[]
  ): Array<{ clubId: string; clubName: string; decline: number }> {
    const decliningClubs = clubTrends
      .map(club => {
        if (club.membershipTrend.length < 2) {
          return { clubId: club.clubId, clubName: club.clubName, decline: 0 }
        }

        const first = club.membershipTrend[0]?.count ?? 0
        const last =
          club.membershipTrend[club.membershipTrend.length - 1]?.count ?? 0
        const decline = first - last

        return { clubId: club.clubId, clubName: club.clubName, decline }
      })
      .filter(club => club.decline > 0)
      .sort((a, b) => b.decline - a.decline)
      .slice(0, 10)

    return decliningClubs
  }

  /**
   * Identify seasonal patterns in membership changes
   * Analyzes month-over-month changes to detect patterns
   *
   * Preserved from backend MembershipAnalyticsModule.identifySeasonalPatterns()
   */
  private identifySeasonalPatterns(
    membershipTrend: Array<{ date: string; count: number }>
  ): SeasonalPattern[] {
    if (membershipTrend.length < 2) {
      return []
    }

    const monthlyChanges = new Map<number, number[]>()

    for (let i = 1; i < membershipTrend.length; i++) {
      const currentPoint = membershipTrend[i]
      const previousPoint = membershipTrend[i - 1]

      if (!currentPoint || !previousPoint) {
        continue
      }

      const month = parseInt(currentPoint.date.substring(5, 7))
      const change = currentPoint.count - previousPoint.count

      if (!monthlyChanges.has(month)) {
        monthlyChanges.set(month, [])
      }
      monthlyChanges.get(month)!.push(change)
    }

    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ]

    const patterns: SeasonalPattern[] = []

    for (let month = 1; month <= 12; month++) {
      const changes = monthlyChanges.get(month) || []

      if (changes.length === 0) {
        continue
      }

      const averageChange =
        changes.reduce((sum, val) => sum + val, 0) / changes.length

      let trend: 'growth' | 'decline' | 'stable'
      if (averageChange > 2) {
        trend = 'growth'
      } else if (averageChange < -2) {
        trend = 'decline'
      } else {
        trend = 'stable'
      }

      patterns.push({
        month,
        monthName: monthNames[month - 1] ?? 'Unknown',
        averageChange: Math.round(averageChange * 10) / 10,
        trend,
      })
    }

    patterns.sort((a, b) => a.month - b.month)

    return patterns
  }

  /**
   * Calculate program year membership change
   * Toastmasters program year runs July 1 - June 30
   *
   * Preserved from backend MembershipAnalyticsModule.calculateProgramYearChange()
   */
  private calculateProgramYearChange(
    membershipTrend: Array<{ date: string; count: number }>
  ): number {
    if (membershipTrend.length === 0) {
      return 0
    }

    const latestDate = membershipTrend[membershipTrend.length - 1]?.date
    if (!latestDate) {
      return 0
    }

    const latestYear = parseInt(latestDate.substring(0, 4))
    const latestMonth = parseInt(latestDate.substring(5, 7))

    let programYearStart: string
    if (latestMonth >= 7) {
      programYearStart = `${latestYear}-07-01`
    } else {
      programYearStart = `${latestYear - 1}-07-01`
    }

    const programYearStartData = membershipTrend.find(
      point => point.date >= programYearStart
    )

    if (!programYearStartData) {
      return this.calculateMembershipChangeInternal(membershipTrend)
    }

    const startMembership = programYearStartData.count
    const currentMembership = membershipTrend[membershipTrend.length - 1]?.count
    if (currentMembership === undefined) {
      return 0
    }

    return currentMembership - startMembership
  }

  /**
   * Calculate year-over-year membership comparison
   *
   * Adapted from backend MembershipAnalyticsModule.calculateMembershipYearOverYear()
   * to work with DistrictStatistics[] instead of async data source.
   *
   * @param snapshots - Array of district statistics snapshots
   * @param membershipTrend - Pre-calculated membership trend
   * @returns Year-over-year comparison or undefined if not available
   */
  private calculateMembershipYearOverYear(
    snapshots: DistrictStatistics[],
    membershipTrend: Array<{ date: string; count: number }>
  ): MembershipYearOverYearComparison | undefined {
    if (snapshots.length === 0 || membershipTrend.length === 0) {
      return undefined
    }

    const latestSnapshot = snapshots[snapshots.length - 1]
    if (!latestSnapshot) {
      return undefined
    }

    const currentDate = latestSnapshot.snapshotDate

    // Compare against the previous PROGRAM year, not the prior calendar year —
    // a calendar-year match picks a Jul-Dec snapshot of the SAME program year
    // for a Jan-Jun currentDate (#1116 item 1).
    const previousSnapshot = selectPreviousProgramYearSnapshot(
      snapshots,
      currentDate
    )

    if (!previousSnapshot) {
      return undefined
    }

    const currentMembership = this.getTotalMembership(latestSnapshot)
    const previousMembership = this.getTotalMembership(previousSnapshot)
    const membershipChange = currentMembership - previousMembership
    const percentageChange =
      previousMembership > 0
        ? Math.round((membershipChange / previousMembership) * 1000) / 10
        : 0

    return {
      currentMembership,
      previousMembership,
      percentageChange,
      membershipChange,
    }
  }

  /**
   * Analyze club trends over time (internal version for MembershipAnalytics)
   *
   * Adapted from backend MembershipAnalyticsModule.analyzeClubTrends()
   * to work with DistrictStatistics[] instead of DistrictCacheEntry[].
   */
  private analyzeClubTrendsInternal(
    snapshots: DistrictStatistics[]
  ): ClubMembershipTrend[] {
    if (snapshots.length === 0) {
      return []
    }

    const latestSnapshot = snapshots[snapshots.length - 1]
    if (!latestSnapshot) {
      return []
    }

    const clubMap = new Map<string, ClubMembershipTrend>()

    // Initialize club trends from latest data
    for (const club of latestSnapshot.clubs) {
      clubMap.set(club.clubId, {
        clubId: club.clubId,
        clubName: club.clubName,
        membershipTrend: [],
        dcpGoalsTrend: [],
      })
    }

    // Build trends for each club across all snapshots
    for (const snapshot of snapshots) {
      for (const club of snapshot.clubs) {
        const clubTrend = clubMap.get(club.clubId)
        if (clubTrend) {
          clubTrend.membershipTrend.push({
            date: snapshot.snapshotDate,
            count: club.membershipCount,
          })

          clubTrend.dcpGoalsTrend.push({
            date: snapshot.snapshotDate,
            goalsAchieved: club.dcpGoals,
          })
        }
      }
    }

    return Array.from(clubMap.values())
  }

  // ========== MembershipTrendData-specific Private Methods ==========

  /**
   * Calculate membership trend over time
   */
  private calculateMembershipTrend(
    snapshots: DistrictStatistics[]
  ): MembershipTrendPoint[] {
    return snapshots.map(snapshot => ({
      date: snapshot.snapshotDate,
      count: this.getTotalMembership(snapshot),
    }))
  }

  /**
   * Calculate payments trend over time
   */
  private calculatePaymentsTrend(
    snapshots: DistrictStatistics[]
  ): PaymentsTrendPoint[] {
    return snapshots.map(snapshot => ({
      date: snapshot.snapshotDate,
      payments: this.getTotalPayments(snapshot),
    }))
  }

  /**
   * Calculate year-over-year comparison (for MembershipTrendData)
   */
  private calculateYearOverYear(
    snapshots: DistrictStatistics[]
  ): YearOverYearComparison | undefined {
    if (snapshots.length === 0) {
      return undefined
    }

    const latestSnapshot = snapshots[snapshots.length - 1]
    if (!latestSnapshot) {
      return undefined
    }

    const currentDate = latestSnapshot.snapshotDate
    const currentYear = parseInt(currentDate.substring(0, 4))

    // Compare against the previous PROGRAM year, not the prior calendar year —
    // a calendar-year match picks a Jul-Dec snapshot of the SAME program year
    // for a Jan-Jun currentDate (#1116 item 1).
    const previousSnapshot = selectPreviousProgramYearSnapshot(
      snapshots,
      currentDate
    )

    if (!previousSnapshot) {
      return undefined
    }

    const currentMembership = this.getTotalMembership(latestSnapshot)
    const previousMembership = this.getTotalMembership(previousSnapshot)
    const membershipChange = currentMembership - previousMembership
    const membershipChangePercent =
      previousMembership > 0
        ? Math.round((membershipChange / previousMembership) * 1000) / 10
        : 0

    const currentPayments = this.getTotalPayments(latestSnapshot)
    const previousPayments = this.getTotalPayments(previousSnapshot)
    const paymentsChange = currentPayments - previousPayments
    const paymentsChangePercent =
      previousPayments > 0
        ? Math.round((paymentsChange / previousPayments) * 1000) / 10
        : 0

    return {
      // currentYear/previousYear are calendar-year labels; they stay aligned
      // with the program-year-selected previousSnapshot because the selector's
      // anchor is currentDate minus one calendar year (findPreviousProgramYearDate).
      currentYear,
      previousYear: currentYear - 1,
      membershipChange,
      membershipChangePercent,
      paymentsChange,
      paymentsChangePercent,
    }
  }

  /**
   * Analyze club trends over time (for public methods)
   */
  private analyzeClubTrends(
    snapshots: DistrictStatistics[]
  ): ClubMembershipTrend[] {
    if (snapshots.length === 0) {
      return []
    }

    // Get latest snapshot for current club list
    const latestSnapshot = snapshots[snapshots.length - 1]
    if (!latestSnapshot) {
      return []
    }

    const clubMap = new Map<string, ClubMembershipTrend>()

    // Initialize club trends from latest data
    for (const club of latestSnapshot.clubs) {
      clubMap.set(club.clubId, {
        clubId: club.clubId,
        clubName: club.clubName,
        membershipTrend: [],
        dcpGoalsTrend: [],
      })
    }

    // Build trends for each club
    for (const snapshot of snapshots) {
      for (const club of snapshot.clubs) {
        const clubTrend = clubMap.get(club.clubId)
        if (clubTrend) {
          clubTrend.membershipTrend.push({
            date: snapshot.snapshotDate,
            count: club.membershipCount,
          })
        }
      }
    }

    return Array.from(clubMap.values())
  }
}
