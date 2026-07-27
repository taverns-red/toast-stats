/**
 * Distinguished Club Analytics Module
 *
 * Handles DCP goals analysis, distinguished club projections, and achievement tracking.
 * This is the hardened version moved from backend/src/services/analytics/DistinguishedClubAnalyticsModule.ts
 * and adapted to work with DistrictStatistics[] instead of IAnalyticsDataSource.
 *
 * KEY FEATURES (preserved from backend):
 * 1. generateDistinguishedClubAnalytics() returning full DistinguishedClubAnalytics type
 * 2. calculateDistinguishedClubs() for counting clubs at each level
 * 3. calculateDistinguishedProjection() for trend-based projections (DEPRECATED - see below)
 * 4. trackDistinguishedAchievements() for tracking when clubs achieve levels
 * 5. calculateDistinguishedYearOverYear() for year-over-year comparison
 * 6. analyzeDCPGoals() for identifying most/least commonly achieved goals
 *
 * NOTE: The linear regression projection in calculateDistinguishedProjection() is deprecated.
 * Projections now use thriving club count directly via generateDistinguishedProjection(thrivingCount).
 * See: projected-year-end-simplification spec, Requirement 1.3
 *
 * Requirements: 5.1, 5.2
 */

import type { DistrictStatistics, ClubStatistics } from '../interfaces.js'
import type {
  DistinguishedClubAnalytics,
  DistinguishedClubAchievement,
  DCPGoalAnalysis,
  DistinguishedClubCounts,
  DistinguishedClubSummary,
  DistinguishedProjection,
} from '../types.js'
import type { ScrapedRecord } from '@taverns-red/shared-contracts'
import {
  DCP_GOAL_DEFINITIONS,
  hasDcpGoalColumns,
  isDcpGoalAchieved,
} from './dcpGoalDefinitions.js'
import {
  ensureString,
  findPreviousProgramYearDate,
  selectPreviousProgramYearSnapshot,
} from './AnalyticsUtils.js'
import {
  calculateNetGrowth,
  determineDistinguishedLevel,
  getCSPStatus,
} from './ClubEligibilityUtils.js'

/**
 * Simple logger interface for compatibility.
 */
const logger = {
  info: (message: string, context?: Record<string, unknown>) => {
    if (process.env['NODE_ENV'] !== 'test') {
      console.error(`[INFO] ${message}`, context)
    }
  },
  warn: (message: string, context?: Record<string, unknown>) => {
    if (process.env['NODE_ENV'] !== 'test') {
      console.warn(`[WARN] ${message}`, context)
    }
  },
  error: (message: string, context?: Record<string, unknown>) => {
    if (process.env['NODE_ENV'] !== 'test') {
      console.error(`[ERROR] ${message}`, context)
    }
  },
  debug: (message: string, _context?: Record<string, unknown>) => {
    // Debug logging disabled in production
    if (process.env['NODE_ENV'] === 'development') {
      console.error(`[DEBUG] ${message}`, _context)
    }
  },
}

/**
 * Internal structure for tracking club data across snapshots.
 * Mirrors the backend DistrictCacheEntry structure for computation.
 */
interface DistrictCacheEntry {
  districtId: string
  date: string
  clubPerformance: ClubStatistics[]
  fetchedAt: string
}

/**
 * DistinguishedClubAnalyticsModule
 *
 * Specialized module for distinguished club analytics calculations.
 * Works directly with DistrictStatistics[] data without external dependencies.
 * Stateless module - no constructor required.
 *
 * Requirements: 5.1, 5.2
 */
export class DistinguishedClubAnalyticsModule {
  /**
   * Generate comprehensive distinguished club analytics from snapshots
   *
   * This is the main entry point for distinguished club analytics computation.
   * Adapted from backend DistinguishedClubAnalyticsModule.generateDistinguishedClubAnalytics()
   * to work with DistrictStatistics[] instead of IAnalyticsDataSource.
   *
   * @param districtId - The district ID to analyze
   * @param snapshots - Array of district statistics snapshots (sorted by date ascending)
   * @returns DistinguishedClubAnalytics object
   */
  generateDistinguishedClubAnalytics(
    districtId: string,
    snapshots: DistrictStatistics[]
  ): DistinguishedClubAnalytics {
    // Filter snapshots for the requested district
    const districtSnapshots = snapshots.filter(s => s.districtId === districtId)

    if (districtSnapshots.length === 0) {
      return this.createEmptyAnalytics()
    }

    // Convert to internal cache entry format for computation
    const dataEntries = this.convertToDataEntries(districtSnapshots)

    const latestEntry = dataEntries[dataEntries.length - 1]
    if (!latestEntry) {
      return this.createEmptyAnalytics()
    }

    // Count clubs at each distinguished level (Requirement 7.1)
    const distinguishedClubs = this.calculateDistinguishedClubs(latestEntry)

    // Calculate projection for final distinguished club count (Requirement 7.2)
    const distinguishedProjection =
      this.calculateDistinguishedProjection(dataEntries)

    // Track dates when clubs achieve distinguished levels (Requirement 7.3)
    const achievements = this.trackDistinguishedAchievements(dataEntries)

    // Compare to previous years if data available (Requirement 7.4)
    const yearOverYearComparison = this.calculateDistinguishedYearOverYear(
      districtSnapshots,
      latestEntry.date
    )

    // Identify most/least commonly achieved DCP goals (Requirement 7.5)
    // Pass raw CSV records when available for accurate per-goal counting (#135)
    const latestSnapshot = districtSnapshots[districtSnapshots.length - 1]
    const rawClubRecords = latestSnapshot?.clubPerformance
    const dcpGoalAnalysis = this.analyzeDCPGoals(latestEntry, rawClubRecords)

    const analytics: DistinguishedClubAnalytics = {
      distinguishedClubs,
      distinguishedProjection,
      achievements,
      yearOverYearComparison,
      dcpGoalAnalysis,
    }

    logger.info('Generated distinguished club analytics', {
      districtId,
      totalDistinguished: distinguishedClubs.total,
      presidents: distinguishedClubs.presidents,
      select: distinguishedClubs.select,
      distinguished: distinguishedClubs.distinguished,
      projectedTotal: distinguishedProjection.total,
    })

    return analytics
  }

  /**
   * Generate distinguished club counts for AnalyticsComputer
   *
   * This method provides the counts object expected by the DistrictAnalytics type.
   * Used by AnalyticsComputer for the distinguishedClubs field.
   *
   * @param snapshots - Array of district statistics snapshots
   * @returns DistinguishedClubCounts object
   */
  generateDistinguishedClubCounts(
    snapshots: DistrictStatistics[]
  ): DistinguishedClubCounts {
    if (snapshots.length === 0) {
      return {
        smedley: 0,
        presidents: 0,
        select: 0,
        distinguished: 0,
        total: 0,
      }
    }

    const latestSnapshot = snapshots[snapshots.length - 1]
    if (!latestSnapshot) {
      return {
        smedley: 0,
        presidents: 0,
        select: 0,
        distinguished: 0,
        total: 0,
      }
    }

    const entry = this.convertSnapshotToEntry(latestSnapshot)
    return this.calculateDistinguishedClubs(entry)
  }

  /**
   * Generate distinguished club summaries for AnalyticsComputer
   *
   * This method provides the detailed list of distinguished clubs
   * expected by the DistrictAnalytics type.
   * Used by AnalyticsComputer for the distinguishedClubsList field.
   *
   * @param snapshots - Array of district statistics snapshots
   * @returns Array of DistinguishedClubSummary objects
   */
  generateDistinguishedClubSummaries(
    snapshots: DistrictStatistics[]
  ): DistinguishedClubSummary[] {
    if (snapshots.length === 0) {
      return []
    }

    const latestSnapshot = snapshots[snapshots.length - 1]
    if (!latestSnapshot) {
      return []
    }

    const summaries: DistinguishedClubSummary[] = []

    for (const club of latestSnapshot.clubs) {
      // CSP requirement for 2025-2026+: must have CSP submitted to be distinguished
      const cspSubmitted = getCSPStatus(club)
      if (!cspSubmitted) {
        continue
      }

      const dcpGoals = club.dcpGoals
      const membership = club.membershipCount
      const netGrowth = calculateNetGrowth(club)

      const level = determineDistinguishedLevel(dcpGoals, membership, netGrowth)

      // Only include clubs that have achieved some distinguished level
      if (level !== 'NotDistinguished') {
        summaries.push({
          clubId: club.clubId,
          clubName: club.clubName,
          status: this.mapLevelToStatus(level),
          dcpPoints: dcpGoals, // DCP goals as points
          goalsCompleted: dcpGoals,
        })
      }
    }

    // Sort by status (highest first) then by goals
    const statusOrder = {
      smedley: 4,
      president: 3,
      select: 2,
      distinguished: 1,
      none: 0,
    }
    summaries.sort((a, b) => {
      const statusDiff = statusOrder[b.status] - statusOrder[a.status]
      if (statusDiff !== 0) return statusDiff
      return b.goalsCompleted - a.goalsCompleted
    })

    return summaries
  }

  /**
   * Generate distinguished club projection for AnalyticsComputer
   *
   * This method provides the projection object expected by the DistrictAnalytics type.
   * Used by AnalyticsComputer for the distinguishedProjection field.
   *
   * When thrivingCount is provided, it is used directly as the projected year-end value
   * for all projected* fields. This simplifies the projection by equating it to the
   * count of thriving clubs (clubs on track for distinguished status).
   *
   * Requirements: 1.1, 1.2, 1.3
   *
   * @param snapshots - Array of district statistics snapshots
   * @param thrivingCount - Optional count of thriving clubs to use as projection
   * @returns DistinguishedProjection object
   */
  generateDistinguishedProjection(
    snapshots: DistrictStatistics[],
    thrivingCount?: number
  ): DistinguishedProjection {
    if (snapshots.length === 0) {
      return {
        projectedDistinguished: 0,
        currentDistinguished: 0,
        currentSelect: 0,
        currentPresident: 0,
        projectionDate: new Date().toISOString().split('T')[0] || '',
      }
    }

    const latestSnapshot = snapshots[snapshots.length - 1]
    const latestEntry = latestSnapshot
      ? this.convertSnapshotToEntry(latestSnapshot)
      : null
    const current = latestEntry
      ? this.calculateDistinguishedClubs(latestEntry)
      : { distinguished: 0, select: 0, presidents: 0 }

    // When thrivingCount is provided, use it directly as the projection
    // Single projectedDistinguished field = thriving count (no differentiation by level)
    // Requirements: 1.1, 1.2, 1.3, 2.4
    if (thrivingCount !== undefined) {
      return {
        projectedDistinguished: thrivingCount,
        currentDistinguished: current.distinguished,
        currentSelect: current.select,
        currentPresident: current.presidents,
        projectionDate: latestSnapshot?.snapshotDate || '',
      }
    }

    // Fallback to linear regression when thrivingCount is not provided
    const dataEntries = this.convertToDataEntries(snapshots)
    const projection = this.calculateDistinguishedProjection(dataEntries)

    return {
      projectedDistinguished: projection.distinguished,
      currentDistinguished: current.distinguished,
      currentSelect: current.select,
      currentPresident: current.presidents,
      projectionDate: latestSnapshot?.snapshotDate || '',
    }
  }

  /**
   * Calculate year-over-year distinguished club comparison (Requirement 7.4)
   *
   * @param snapshots - Array of district statistics snapshots
   * @param currentDate - Current snapshot date
   * @returns Year-over-year comparison or undefined if not available
   */
  calculateDistinguishedYearOverYear(
    snapshots: DistrictStatistics[],
    currentDate: string
  ):
    | {
        currentTotal: number
        previousTotal: number
        change: number
        percentageChange: number
        currentByLevel: {
          smedley: number
          presidents: number
          select: number
          distinguished: number
        }
        previousByLevel: {
          smedley: number
          presidents: number
          select: number
          distinguished: number
        }
      }
    | undefined {
    if (snapshots.length === 0) {
      return undefined
    }

    // Find current and the previous-PROGRAM-year snapshots. Matching the
    // previous snapshot by calendar year alone (snapshotYear === currentYear-1)
    // matched a Jul-Dec snapshot of the SAME program year as a June currentDate
    // (#1116 item 1); anchor on the previous program year instead.
    const currentSnapshot = snapshots.find(s => s.snapshotDate === currentDate)
    const previousSnapshot = selectPreviousProgramYearSnapshot(
      snapshots,
      currentDate
    )

    if (!currentSnapshot || !previousSnapshot) {
      logger.info(
        'Insufficient data for year-over-year distinguished comparison',
        {
          currentDate,
          previousYearDate: findPreviousProgramYearDate(currentDate),
          hasCurrentSnapshot: !!currentSnapshot,
          hasPreviousSnapshot: !!previousSnapshot,
        }
      )
      return undefined
    }

    const currentEntry = this.convertSnapshotToEntry(currentSnapshot)
    const previousEntry = this.convertSnapshotToEntry(previousSnapshot)

    const currentCounts = this.calculateDistinguishedClubs(currentEntry)
    const previousCounts = this.calculateDistinguishedClubs(previousEntry)

    const change = currentCounts.total - previousCounts.total
    const percentageChange =
      previousCounts.total > 0
        ? Math.round((change / previousCounts.total) * 1000) / 10 // Round to 1 decimal
        : 0

    return {
      currentTotal: currentCounts.total,
      previousTotal: previousCounts.total,
      change,
      percentageChange,
      currentByLevel: {
        smedley: currentCounts.smedley,
        presidents: currentCounts.presidents,
        select: currentCounts.select,
        distinguished: currentCounts.distinguished,
      },
      previousByLevel: {
        smedley: previousCounts.smedley,
        presidents: previousCounts.presidents,
        select: previousCounts.select,
        distinguished: previousCounts.distinguished,
      },
    }
  }

  // ========== Public Helper Methods ==========

  /**
   * Calculate distinguished clubs from latest data (Requirements: 4.1, 4.2)
   * Counts clubs at each distinguished level and calculates total.
   * Primary: Use 'Club Distinguished Status' field; Fallback: Calculate from DCP goals/membership
   *
   * Starting in 2025-2026, CSP submission is required for distinguished recognition.
   * Clubs without CSP submitted cannot achieve any distinguished level.
   *
   * This method is public to allow AnalyticsComputer to delegate
   * distinguished club calculations to this module.
   *
   * @param entry - District cache entry
   * @returns Distinguished club counts by level and total
   */
  calculateDistinguishedClubs(entry: DistrictCacheEntry): {
    smedley: number
    presidents: number
    select: number
    distinguished: number
    total: number
  } {
    let smedley = 0
    let presidents = 0
    let select = 0
    let distinguished = 0

    for (const club of entry.clubPerformance) {
      // CSP requirement for 2025-2026+: must have CSP submitted to be distinguished
      const cspSubmitted = getCSPStatus(club)
      if (!cspSubmitted) {
        // Club cannot be distinguished without CSP
        continue
      }

      // Calculate based on DCP goals, membership, and net growth
      const dcpGoals = club.dcpGoals
      const membership = club.membershipCount
      const netGrowth = calculateNetGrowth(club)

      // Use the shared distinguished level determination logic
      const calculatedLevel = determineDistinguishedLevel(
        dcpGoals,
        membership,
        netGrowth
      )

      // Count clubs by distinguished level (Requirements: 4.1, 4.2)
      if (calculatedLevel === 'Smedley') {
        smedley++
      } else if (calculatedLevel === 'President') {
        presidents++
      } else if (calculatedLevel === 'Select') {
        select++
      } else if (calculatedLevel === 'Distinguished') {
        distinguished++
      }

      // Debug logging with club details (only when in development environment)
      logger.debug('Distinguished status calculation', {
        clubId: club.clubId,
        clubName: club.clubName,
        distinguishedLevel: calculatedLevel,
        dcpGoals,
        membership,
      })
    }

    return {
      smedley,
      presidents,
      select,
      distinguished,
      total: smedley + presidents + select + distinguished,
    }
  }

  // ========== Private Helper Methods ==========

  /**
   * Create empty analytics result for when no data is available
   */
  private createEmptyAnalytics(): DistinguishedClubAnalytics {
    return {
      distinguishedClubs: {
        smedley: 0,
        presidents: 0,
        select: 0,
        distinguished: 0,
        total: 0,
      },
      distinguishedProjection: {
        smedley: 0,
        presidents: 0,
        select: 0,
        distinguished: 0,
        total: 0,
      },
      achievements: [],
      yearOverYearComparison: undefined,
      dcpGoalAnalysis: {
        mostCommonlyAchieved: [],
        leastCommonlyAchieved: [],
      },
    }
  }

  /**
   * Convert DistrictStatistics[] to internal DistrictCacheEntry[] format
   */
  private convertToDataEntries(
    snapshots: DistrictStatistics[]
  ): DistrictCacheEntry[] {
    return snapshots.map(snapshot => this.convertSnapshotToEntry(snapshot))
  }

  /**
   * Convert a single DistrictStatistics to DistrictCacheEntry format
   */
  private convertSnapshotToEntry(
    snapshot: DistrictStatistics
  ): DistrictCacheEntry {
    return {
      districtId: snapshot.districtId,
      date: snapshot.snapshotDate,
      clubPerformance: snapshot.clubs,
      fetchedAt: snapshot.snapshotDate,
    }
  }

  /**
   * Calculate distinguished club projection based on trends (Requirement 7.2)
   *
   * @deprecated This method uses linear regression which is no longer the primary
   * projection method. The projection now uses thriving club count directly via
   * the `thrivingCount` parameter in `generateDistinguishedProjection()`.
   * This method is retained for backward compatibility only.
   * See: projected-year-end-simplification spec, Requirement 1.3
   */
  private calculateDistinguishedProjection(dataEntries: DistrictCacheEntry[]): {
    smedley: number
    presidents: number
    select: number
    distinguished: number
    total: number
  } {
    if (dataEntries.length < 2) {
      // Not enough data for projection, return current counts
      const latest = dataEntries[0]
      if (!latest) {
        return {
          smedley: 0,
          presidents: 0,
          select: 0,
          distinguished: 0,
          total: 0,
        }
      }
      return this.calculateDistinguishedClubs(latest)
    }

    // Calculate trend for each level
    const trends = {
      smedley: [] as number[],
      presidents: [] as number[],
      select: [] as number[],
      distinguished: [] as number[],
    }

    for (const entry of dataEntries) {
      const counts = this.calculateDistinguishedClubs(entry)
      trends.smedley.push(counts.smedley)
      trends.presidents.push(counts.presidents)
      trends.select.push(counts.select)
      trends.distinguished.push(counts.distinguished)
    }

    // Calculate linear trend and project forward
    const projectLevel = (values: number[]): number => {
      if (values.length < 2) return values[0] || 0

      // Simple linear regression
      const n = values.length
      const sumX = (n * (n - 1)) / 2 // Sum of indices 0, 1, 2, ...
      const sumY = values.reduce((sum, val) => sum + val, 0)
      const sumXY = values.reduce((sum, val, idx) => sum + idx * val, 0)
      const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6 // Sum of squares

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
      const intercept = (sumY - slope * sumX) / n

      // Project forward by 2-3 time periods (conservative estimate)
      const projectionPeriods = 2
      const projection = slope * (n + projectionPeriods) + intercept

      return Math.max(0, Math.round(projection))
    }

    const smedley = projectLevel(trends.smedley)
    const presidents = projectLevel(trends.presidents)
    const select = projectLevel(trends.select)
    const distinguished = projectLevel(trends.distinguished)

    return {
      smedley,
      presidents,
      select,
      distinguished,
      total: smedley + presidents + select + distinguished,
    }
  }

  /**
   * Track dates when clubs achieve distinguished levels (Requirement 7.3)
   */
  private trackDistinguishedAchievements(
    dataEntries: DistrictCacheEntry[]
  ): DistinguishedClubAchievement[] {
    const achievements: DistinguishedClubAchievement[] = []
    const clubLevelHistory = new Map<string, { level?: string; date: string }>()

    // Process entries chronologically
    for (const entry of dataEntries) {
      for (const club of entry.clubPerformance) {
        const clubId = ensureString(club.clubId)
        const clubName = ensureString(club.clubName)
        const dcpGoals = club.dcpGoals

        if (!clubId) continue

        // Use the shared distinguished-level logic (net-growth alternative for
        // Select/Distinguished) and the CSP gate, matching the other
        // distinguished paths in this module (#1116 item 4). The inlined ladder
        // here had neither, so it missed net-growth qualifiers and tracked
        // CSP-less clubs. 'NotDistinguished' is normalised to undefined so the
        // achievement-history checks below stay unchanged.
        const level = getCSPStatus(club)
          ? determineDistinguishedLevel(
              dcpGoals,
              club.membershipCount,
              calculateNetGrowth(club)
            )
          : 'NotDistinguished'
        const currentLevel: string | undefined =
          level === 'NotDistinguished' ? undefined : level

        const previousRecord = clubLevelHistory.get(clubId)

        // Check if club achieved a new level
        if (currentLevel && (!previousRecord || !previousRecord.level)) {
          // First time achieving distinguished status
          achievements.push({
            clubId,
            clubName,
            level: currentLevel as
              'Smedley' | 'President' | 'Select' | 'Distinguished',
            achievedDate: entry.date,
            goalsAchieved: dcpGoals,
          })
        } else if (
          currentLevel &&
          previousRecord &&
          previousRecord.level &&
          this.isHigherLevel(currentLevel, previousRecord.level)
        ) {
          // Upgraded to a higher level
          achievements.push({
            clubId,
            clubName,
            level: currentLevel as
              'Smedley' | 'President' | 'Select' | 'Distinguished',
            achievedDate: entry.date,
            goalsAchieved: dcpGoals,
          })
        }

        // Update history
        clubLevelHistory.set(clubId, {
          level: currentLevel,
          date: entry.date,
        })
      }
    }

    // Sort by date (most recent first)
    achievements.sort((a, b) => b.achievedDate.localeCompare(a.achievedDate))

    return achievements
  }

  /**
   * Analyze DCP goals to identify most/least commonly achieved (Requirement 7.5)
   *
   * When rawClubRecords are available (#135), reads actual per-goal columns
   * from the CSV data. Falls back to sequential approximation for legacy data.
   */
  private analyzeDCPGoals(
    entry: DistrictCacheEntry,
    rawClubRecords?: ScrapedRecord[]
  ): {
    mostCommonlyAchieved: DCPGoalAnalysis[]
    leastCommonlyAchieved: DCPGoalAnalysis[]
  } {
    // DCP has 10 goals (numbered 1-10)
    const goalCounts: number[] = Array(10).fill(0) as number[]
    const totalClubs = entry.clubPerformance.length

    // Check if raw CSV records have per-goal columns
    const hasGoalColumns =
      rawClubRecords &&
      rawClubRecords.length > 0 &&
      rawClubRecords[0] !== undefined &&
      hasDcpGoalColumns(rawClubRecords[0])

    if (hasGoalColumns && rawClubRecords) {
      // #135 fix: Use actual per-goal columns from raw CSV data
      // #1118: evaluated via the shared DCP goal definitions
      for (const record of rawClubRecords) {
        for (const goalDef of DCP_GOAL_DEFINITIONS) {
          if (isDcpGoalAchieved(record, goalDef)) {
            goalCounts[goalDef.goal - 1] =
              (goalCounts[goalDef.goal - 1] ?? 0) + 1
          }
        }
      }
    } else {
      // Fallback: sequential approximation for legacy data without per-goal columns
      for (const club of entry.clubPerformance) {
        const dcpGoals = club.dcpGoals
        for (let i = 0; i < Math.min(dcpGoals, 10); i++) {
          goalCounts[i] = (goalCounts[i] ?? 0) + 1
        }
      }
    }

    // Create analysis for each goal
    const goalAnalysis: DCPGoalAnalysis[] = []
    for (let i = 0; i < 10; i++) {
      const count = goalCounts[i] ?? 0
      goalAnalysis.push({
        goalNumber: i + 1,
        achievementCount: count,
        achievementPercentage:
          totalClubs > 0
            ? Math.round((count / totalClubs) * 1000) / 10 // Round to 1 decimal
            : 0,
      })
    }

    // Sort by achievement count
    const sortedByCount = [...goalAnalysis].sort(
      (a, b) => b.achievementCount - a.achievementCount
    )

    // Get top 5 most commonly achieved and bottom 5 least commonly achieved
    const mostCommonlyAchieved = sortedByCount.slice(0, 5)
    const leastCommonlyAchieved = sortedByCount.slice(-5).reverse()

    return {
      mostCommonlyAchieved,
      leastCommonlyAchieved,
    }
  }

  // NOTE: calculateNetGrowth, getCSPStatus, and determineDistinguishedLevel
  // have been extracted to ClubEligibilityUtils.ts as shared pure functions.

  /**
   * Check if level1 is higher than level2
   */
  private isHigherLevel(level1: string, level2: string): boolean {
    const levels = { Distinguished: 1, Select: 2, President: 3, Smedley: 4 }
    return (
      (levels[level1 as keyof typeof levels] || 0) >
      (levels[level2 as keyof typeof levels] || 0)
    )
  }

  /**
   * Map distinguished level string to status type
   */
  private mapLevelToStatus(
    level: string
  ): 'smedley' | 'president' | 'select' | 'distinguished' | 'none' {
    switch (level) {
      case 'Smedley':
        return 'smedley'
      case 'President':
        return 'president'
      case 'Select':
        return 'select'
      case 'Distinguished':
        return 'distinguished'
      default:
        return 'none'
    }
  }
}
