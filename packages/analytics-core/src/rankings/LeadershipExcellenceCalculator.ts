/**
 * LeadershipExcellenceCalculator (#333)
 *
 * District Leadership Excellence Award: districts that are Distinguished
 * for 3 or more consecutive years. Any Distinguished tier counts
 * (Distinguished, Select, Presidents, Smedley).
 *
 * Counts backwards from the most recent year in the history.
 * A missing year in the sequence breaks the streak.
 *
 * Source: Item 1490, Rev. 04/2025
 */

import type { DistinguishedDistrictTier } from './DistinguishedDistrictCalculator.js'

export interface LeadershipExcellenceInput {
  districtId: string
  districtName: string
  region: string
  yearEndTiers: Array<{
    programYear: string
    tier: DistinguishedDistrictTier
  }>
}

export interface LeadershipExcellenceResult {
  districtId: string
  districtName: string
  region: string
  consecutiveYears: number
  qualifies: boolean
  streakDetails: Array<{
    programYear: string
    tier: DistinguishedDistrictTier
  }>
}

export interface LeadershipExcellenceStandings {
  qualifyingDistricts: LeadershipExcellenceResult[]
  allDistricts: LeadershipExcellenceResult[]
}

const CONSECUTIVE_YEARS_THRESHOLD = 3

export class LeadershipExcellenceCalculator {
  calculate(
    inputs: LeadershipExcellenceInput[]
  ): LeadershipExcellenceStandings {
    const allDistricts: LeadershipExcellenceResult[] = inputs.map(input => {
      const { consecutiveYears, streakDetails } = this.countConsecutiveYears(
        input.yearEndTiers
      )
      return {
        districtId: input.districtId,
        districtName: input.districtName,
        region: input.region,
        consecutiveYears,
        qualifies: consecutiveYears >= CONSECUTIVE_YEARS_THRESHOLD,
        streakDetails,
      }
    })

    allDistricts.sort((a, b) => b.consecutiveYears - a.consecutiveYears)

    return {
      qualifyingDistricts: allDistricts.filter(d => d.qualifies),
      allDistricts,
    }
  }

  private countConsecutiveYears(
    tiers: Array<{ programYear: string; tier: DistinguishedDistrictTier }>
  ): {
    consecutiveYears: number
    streakDetails: Array<{
      programYear: string
      tier: DistinguishedDistrictTier
    }>
  } {
    if (tiers.length === 0) {
      return { consecutiveYears: 0, streakDetails: [] }
    }

    // Sort ascending by programYear
    const sorted = [...tiers].sort((a, b) =>
      a.programYear.localeCompare(b.programYear)
    )

    // Count backwards from the most recent year
    const streakDetails: Array<{
      programYear: string
      tier: DistinguishedDistrictTier
    }> = []

    for (let i = sorted.length - 1; i >= 0; i--) {
      const entry = sorted[i]!
      if (entry.tier === 'NotDistinguished') break

      // Check for consecutive year gap
      if (i < sorted.length - 1) {
        const nextYear = sorted[i + 1]!.programYear
        if (!this.isConsecutive(entry.programYear, nextYear)) break
      }

      streakDetails.unshift(entry)
    }

    return {
      consecutiveYears: streakDetails.length,
      streakDetails,
    }
  }

  /**
   * Check if two program years are consecutive.
   * "2023-2024" followed by "2024-2025" = consecutive.
   */
  private isConsecutive(earlier: string, later: string): boolean {
    const earlierEnd = parseInt(earlier.split('-')[1]!, 10)
    const laterStart = parseInt(later.split('-')[0]!, 10)
    return earlierEnd === laterStart
  }
}
