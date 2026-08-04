/**
 * Area Recognition Module
 *
 * Aggregates per-area club counts (total / paid / distinguished) from a
 * district snapshot. The only live consumer is
 * `AnalyticsComputer.computePerformanceTargets`, which sums `paidClubs` and
 * `distinguishedClubs` across areas to derive the district's distinguished
 * target.
 *
 * The former divergent recognition-LEVEL logic (DAP/DDP percent-based tiers,
 * eligibility gates, threshold percentages, division recognition) was removed
 * in #799: it had no live consumer and conflicted with the verified
 * recognition source of truth (`divisionGapAnalysis.ts`, DDP manual item 1490).
 * The club-paid / club-distinguished counting below is unchanged from the
 * prior implementation — the computed counts are byte-identical.
 *
 * Requirements: 7.1
 */

import type { DistrictStatistics, ClubStatistics } from '../interfaces.js'
import type { AreaRecognition } from '../types.js'
import { programYearForDate } from './AnalyticsUtils.js'
import {
  calculateNetGrowth,
  determineDistinguishedLevel,
  getCSPStatus,
} from './ClubEligibilityUtils.js'

/**
 * AreaDivisionRecognitionModule
 *
 * Calculates per-area club counts for areas in a district. Works directly with
 * DistrictStatistics data without external dependencies. Stateless module — all
 * methods accept data as parameters.
 *
 * Requirements: 7.1
 */
export class AreaDivisionRecognitionModule {
  /**
   * Calculate per-area club counts for all areas in a district.
   *
   * @param snapshot - District statistics snapshot
   * @returns Array of AreaRecognition objects
   */
  calculateAreaRecognition(snapshot: DistrictStatistics): AreaRecognition[] {
    // Group clubs by area
    const areaMap = new Map<
      string,
      {
        areaId: string
        areaName: string
        divisionId: string
        clubs: ClubStatistics[]
      }
    >()

    for (const club of snapshot.clubs) {
      const areaId = club.areaId
      if (!areaId) continue

      if (!areaMap.has(areaId)) {
        areaMap.set(areaId, {
          areaId,
          areaName: club.areaName || areaId,
          divisionId: club.divisionId,
          clubs: [],
        })
      }
      areaMap.get(areaId)!.clubs.push(club)
    }

    // The club recognition ladder is per program year (#1406) — resolve it
    // once from the snapshot's own date and thread it down.
    const programYear = programYearForDate(snapshot.snapshotDate)

    // Calculate counts for each area
    return Array.from(areaMap.values()).map(area =>
      this.calculateSingleAreaRecognition(
        area.areaId,
        area.areaName,
        area.divisionId,
        area.clubs,
        programYear
      )
    )
  }

  /**
   * Calculate club counts for a single area.
   *
   * @param programYear - Program year the snapshot belongs to (#1406)
   */
  private calculateSingleAreaRecognition(
    areaId: string,
    areaName: string,
    divisionId: string,
    clubs: ClubStatistics[],
    programYear: string
  ): AreaRecognition {
    const totalClubs = clubs.length
    const paidClubs = clubs.filter(club => this.isClubPaid(club)).length
    const distinguishedClubs = clubs.filter(
      club => this.isClubPaid(club) && this.isClubDistinguished(club, programYear)
    ).length

    return {
      areaId,
      areaName,
      divisionId,
      totalClubs,
      paidClubs,
      distinguishedClubs,
    }
  }

  // ========== Helper Methods ==========

  /**
   * Check if a club is paid (in good standing)
   * Per steering: Active = paid; Suspended/Ineligible/Low = not paid
   */
  private isClubPaid(club: ClubStatistics): boolean {
    const status = (club.clubStatus || club.status || '').toLowerCase()

    // Active clubs are paid
    if (status === 'active' || status === '') {
      return true
    }

    // Suspended, Ineligible, Low are not paid
    return false
  }

  /**
   * @param programYear - Program year the snapshot belongs to, so the
   *   ladder matches the rules of that year (#1406).
   */
  private isClubDistinguished(
    club: ClubStatistics,
    programYear: string
  ): boolean {
    // CSP required for Distinguished (2025-2026+) (#311)
    if (!getCSPStatus(club)) return false
    const netGrowth = calculateNetGrowth(club)
    const level = determineDistinguishedLevel(
      club.dcpGoals,
      club.membershipCount,
      netGrowth,
      programYear
    )
    return level !== 'NotDistinguished'
  }
}
