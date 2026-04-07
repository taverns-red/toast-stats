/**
 * Area/Division Recognition Module
 *
 * Implements Distinguished Area Program (DAP) and Distinguished Division Program (DDP)
 * recognition calculations per steering document dap-ddp-recognition.md.
 *
 * Key rules:
 * - Eligibility gates hard-block recognition
 * - Distinguished percentages use paid units as denominator
 * - Recognition levels are ordinal: Distinguished < Select < Presidents
 *
 * Moved from backend AnalyticsEngine for shared use in analytics-core.
 * Preserves all hardened computation logic from the backend version.
 *
 * Requirements: 7.1
 */

import type { DistrictStatistics, ClubStatistics } from '../interfaces.js'
import type {
  AreaRecognition,
  DivisionRecognition,
  AreaDivisionRecognitionLevel,
  RecognitionEligibility,
} from '../types.js'
import {
  calculateNetGrowth,
  determineDistinguishedLevel,
  getCSPStatus,
} from './ClubEligibilityUtils.js'

// ========== DAP Thresholds (from steering document) ==========
const DAP_PAID_CLUBS_THRESHOLD = 75 // ≥75% of clubs must be paid
const DAP_DISTINGUISHED_THRESHOLD = 50 // ≥50% for Distinguished
const DAP_SELECT_THRESHOLD = 75 // ≥75% for Select Distinguished
const DAP_PRESIDENTS_THRESHOLD = 100 // 100% for President's Distinguished

// ========== DDP Thresholds (from steering document) ==========
const DDP_PAID_AREAS_THRESHOLD = 85 // ≥85% of areas must be paid
const DDP_DISTINGUISHED_THRESHOLD = 50 // ≥50% for Distinguished
const DDP_SELECT_THRESHOLD = 75 // ≥75% for Select Distinguished
const DDP_PRESIDENTS_THRESHOLD = 100 // 100% for President's Distinguished

/**
 * AreaDivisionRecognitionModule
 *
 * Calculates DAP and DDP recognition status for areas and divisions.
 * Works directly with DistrictStatistics data without external dependencies.
 * Stateless module - all methods accept data as parameters.
 *
 * Requirements: 7.1
 */
export class AreaDivisionRecognitionModule {
  // ========== Public API Methods ==========

  /**
   * Calculate area recognition for all areas in a district
   *
   * @param snapshot - District statistics snapshot
   * @returns Array of AreaRecognition objects
   */
  calculateAreaRecognition(snapshot: DistrictStatistics): AreaRecognition[] {
    return this.analyzeAreaRecognition(snapshot)
  }

  /**
   * Calculate division recognition for all divisions in a district
   *
   * @param snapshot - District statistics snapshot
   * @returns Array of DivisionRecognition objects
   */
  calculateDivisionRecognition(
    snapshot: DistrictStatistics
  ): DivisionRecognition[] {
    return this.analyzeDivisionRecognition(snapshot)
  }

  // ========== Area Recognition Analysis ==========

  /**
   * Analyze area recognition from district statistics
   */
  private analyzeAreaRecognition(
    snapshot: DistrictStatistics
  ): AreaRecognition[] {
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

    // Calculate recognition for each area
    return Array.from(areaMap.values()).map(area =>
      this.calculateSingleAreaRecognition(
        area.areaId,
        area.areaName,
        area.divisionId,
        area.clubs
      )
    )
  }

  /**
   * Calculate recognition for a single area
   */
  private calculateSingleAreaRecognition(
    areaId: string,
    areaName: string,
    divisionId: string,
    clubs: ClubStatistics[]
  ): AreaRecognition {
    const totalClubs = clubs.length
    const paidClubs = clubs.filter(club => this.isClubPaid(club)).length
    const distinguishedClubs = clubs.filter(
      club => this.isClubPaid(club) && this.isClubDistinguished(club)
    ).length

    // Calculate percentages
    const paidClubsPercent =
      totalClubs > 0
        ? Math.round((paidClubs / totalClubs) * 100 * 100) / 100
        : 0
    const distinguishedClubsPercent =
      paidClubs > 0
        ? Math.round((distinguishedClubs / paidClubs) * 100 * 100) / 100
        : 0

    // Check thresholds
    const meetsPaidThreshold = paidClubsPercent >= DAP_PAID_CLUBS_THRESHOLD

    // Determine eligibility (club visits not available from dashboard)
    const eligibility: RecognitionEligibility = 'unknown'
    const eligibilityReason = 'Club visit data not available from dashboard'

    // Determine recognition level based on thresholds
    const recognitionLevel = this.determineAreaRecognitionLevel(
      meetsPaidThreshold,
      distinguishedClubsPercent
    )

    const meetsDistinguishedThreshold = this.checkDistinguishedThreshold(
      recognitionLevel,
      distinguishedClubsPercent,
      DAP_DISTINGUISHED_THRESHOLD
    )

    return {
      areaId,
      areaName,
      divisionId,
      totalClubs,
      paidClubs,
      distinguishedClubs,
      paidClubsPercent,
      distinguishedClubsPercent,
      eligibility,
      eligibilityReason,
      recognitionLevel,
      meetsPaidThreshold,
      meetsDistinguishedThreshold,
    }
  }

  /**
   * Determine area recognition level based on DAP thresholds
   */
  private determineAreaRecognitionLevel(
    meetsPaidThreshold: boolean,
    distinguishedPercent: number
  ): AreaDivisionRecognitionLevel {
    if (!meetsPaidThreshold) {
      return 'NotDistinguished'
    }

    // Check from highest to lowest (ordinal)
    if (distinguishedPercent >= DAP_PRESIDENTS_THRESHOLD) {
      return 'Presidents'
    }
    if (distinguishedPercent >= DAP_SELECT_THRESHOLD) {
      return 'Select'
    }
    if (distinguishedPercent >= DAP_DISTINGUISHED_THRESHOLD) {
      return 'Distinguished'
    }

    return 'NotDistinguished'
  }

  // ========== Division Recognition Analysis ==========

  /**
   * Analyze division recognition from district statistics
   */
  private analyzeDivisionRecognition(
    snapshot: DistrictStatistics
  ): DivisionRecognition[] {
    // First calculate area recognition
    const areaRecognitions = this.analyzeAreaRecognition(snapshot)

    // Group areas by division
    const divisionMap = new Map<
      string,
      {
        divisionId: string
        divisionName: string
        areas: AreaRecognition[]
      }
    >()

    for (const area of areaRecognitions) {
      if (!divisionMap.has(area.divisionId)) {
        // Get division name from first club in this division
        const divisionClub = snapshot.clubs.find(
          club => club.divisionId === area.divisionId
        )
        divisionMap.set(area.divisionId, {
          divisionId: area.divisionId,
          divisionName: divisionClub?.divisionName || area.divisionId,
          areas: [],
        })
      }
      divisionMap.get(area.divisionId)!.areas.push(area)
    }

    // Calculate recognition for each division
    return Array.from(divisionMap.values()).map(division =>
      this.calculateSingleDivisionRecognition(
        division.divisionId,
        division.divisionName,
        division.areas
      )
    )
  }

  /**
   * Calculate recognition for a single division
   */
  private calculateSingleDivisionRecognition(
    divisionId: string,
    divisionName: string,
    areas: AreaRecognition[]
  ): DivisionRecognition {
    const totalAreas = areas.length
    const paidAreas = areas.filter(area => this.isAreaPaid(area)).length
    const distinguishedAreas = areas.filter(
      area =>
        this.isAreaPaid(area) && area.recognitionLevel !== 'NotDistinguished'
    ).length

    // Calculate percentages
    const paidAreasPercent =
      totalAreas > 0
        ? Math.round((paidAreas / totalAreas) * 100 * 100) / 100
        : 0
    const distinguishedAreasPercent =
      paidAreas > 0
        ? Math.round((distinguishedAreas / paidAreas) * 100 * 100) / 100
        : 0

    // Check thresholds
    const meetsPaidThreshold = paidAreasPercent >= DDP_PAID_AREAS_THRESHOLD

    // Determine eligibility (club visits not available from dashboard)
    const eligibility: RecognitionEligibility = 'unknown'
    const eligibilityReason =
      'Area club visit data not available from dashboard'

    // Determine recognition level based on thresholds
    const recognitionLevel = this.determineDivisionRecognitionLevel(
      meetsPaidThreshold,
      distinguishedAreasPercent
    )

    const meetsDistinguishedThreshold = this.checkDistinguishedThreshold(
      recognitionLevel,
      distinguishedAreasPercent,
      DDP_DISTINGUISHED_THRESHOLD
    )

    return {
      divisionId,
      divisionName,
      totalAreas,
      paidAreas,
      distinguishedAreas,
      paidAreasPercent,
      distinguishedAreasPercent,
      eligibility,
      eligibilityReason,
      recognitionLevel,
      meetsPaidThreshold,
      meetsDistinguishedThreshold,
      areas,
    }
  }

  /**
   * Determine division recognition level based on DDP thresholds
   */
  private determineDivisionRecognitionLevel(
    meetsPaidThreshold: boolean,
    distinguishedPercent: number
  ): AreaDivisionRecognitionLevel {
    if (!meetsPaidThreshold) {
      return 'NotDistinguished'
    }

    // Check from highest to lowest (ordinal)
    if (distinguishedPercent >= DDP_PRESIDENTS_THRESHOLD) {
      return 'Presidents'
    }
    if (distinguishedPercent >= DDP_SELECT_THRESHOLD) {
      return 'Select'
    }
    if (distinguishedPercent >= DDP_DISTINGUISHED_THRESHOLD) {
      return 'Distinguished'
    }

    return 'NotDistinguished'
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

  private isClubDistinguished(club: ClubStatistics): boolean {
    // CSP required for Distinguished (2025-2026+) (#311)
    if (!getCSPStatus(club)) return false
    const netGrowth = calculateNetGrowth(club)
    const level = determineDistinguishedLevel(
      club.dcpGoals,
      club.membershipCount,
      netGrowth
    )
    return level !== 'NotDistinguished'
  }

  /**
   * Check if an area is paid (not suspended due to unpaid clubs)
   * An area is considered paid if it has at least one paid club
   */
  private isAreaPaid(area: AreaRecognition): boolean {
    return area.paidClubs > 0
  }

  // NOTE: calculateNetGrowth has been extracted to ClubEligibilityUtils.ts
  // as a shared pure function.

  /**
   * Check if distinguished threshold is met for the given recognition level
   */
  private checkDistinguishedThreshold(
    recognitionLevel: AreaDivisionRecognitionLevel,
    distinguishedPercent: number,
    baseThreshold: number
  ): boolean {
    if (recognitionLevel === 'NotDistinguished') {
      return false
    }
    return distinguishedPercent >= baseThreshold
  }
}

// ========== Exported Threshold Constants ==========
export const DAP_THRESHOLDS = {
  PAID_CLUBS: DAP_PAID_CLUBS_THRESHOLD,
  DISTINGUISHED: DAP_DISTINGUISHED_THRESHOLD,
  SELECT: DAP_SELECT_THRESHOLD,
  PRESIDENTS: DAP_PRESIDENTS_THRESHOLD,
} as const

export const DDP_THRESHOLDS = {
  PAID_AREAS: DDP_PAID_AREAS_THRESHOLD,
  DISTINGUISHED: DDP_DISTINGUISHED_THRESHOLD,
  SELECT: DDP_SELECT_THRESHOLD,
  PRESIDENTS: DDP_PRESIDENTS_THRESHOLD,
} as const
