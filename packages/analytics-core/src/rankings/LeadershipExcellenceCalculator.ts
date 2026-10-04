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
 * The award year itself counts (#1609): at the year-end close, a district
 * Distinguished in Y-2, Y-1 and Y receives year Y's award (TI's Hall of Fame
 * asterisk follows this). Mid-year nobody is a recipient for the current
 * year; a district with 2+ prior consecutive years that is currently
 * tracking Distinguished is reported as on track.
 *
 * Source: Item 1490, Rev. 04/2025
 */

import type { DistinguishedDistrictTier } from './DistinguishedDistrictCalculator.js'

export interface LeadershipExcellenceInput {
  districtId: string
  districtName: string
  region: string
  /** Completed program years BEFORE the current one. */
  yearEndTiers: Array<{
    programYear: string
    tier: DistinguishedDistrictTier
  }>
  /**
   * The program year the snapshot describes (#1609). The award year counts
   * toward its own streak, but only once its year-end close is in
   * (`final`). Before that, a qualifying trajectory is reported as on track.
   */
  currentYear?: {
    programYear: string
    tier: DistinguishedDistrictTier
    final: boolean
  }
}

export interface LeadershipExcellenceResult {
  districtId: string
  districtName: string
  region: string
  consecutiveYears: number
  qualifies: boolean
  /**
   * Mid-year only (#1609): 2+ consecutive Distinguished years immediately
   * before the current one, and currently tracking Distinguished.
   */
  onTrack: boolean
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

function isDistinguishedTier(tier: DistinguishedDistrictTier): boolean {
  return tier !== 'NotDistinguished' && tier !== 'Unknown'
}

export class LeadershipExcellenceCalculator {
  calculate(
    inputs: LeadershipExcellenceInput[]
  ): LeadershipExcellenceStandings {
    const allDistricts: LeadershipExcellenceResult[] = inputs.map(input => {
      const { currentYear } = input
      // The award year counts toward its own streak (TI semantics, #1609),
      // but only once its year-end close is in.
      const counted =
        currentYear?.final === true
          ? [
              ...input.yearEndTiers,
              { programYear: currentYear.programYear, tier: currentYear.tier },
            ]
          : input.yearEndTiers
      const { consecutiveYears, streakDetails } =
        this.countConsecutiveYears(counted)

      // Mid-year: never a recipient for the current year yet. On track =
      // the prior streak runs right up to the current year with ≥ 2 years,
      // and the district is currently tracking Distinguished.
      const inProgress = currentYear !== undefined && !currentYear.final
      const lastStreakYear = streakDetails[streakDetails.length - 1]
      const onTrack =
        inProgress &&
        isDistinguishedTier(currentYear.tier) &&
        consecutiveYears >= CONSECUTIVE_YEARS_THRESHOLD - 1 &&
        lastStreakYear !== undefined &&
        this.isConsecutive(lastStreakYear.programYear, currentYear.programYear)

      return {
        districtId: input.districtId,
        districtName: input.districtName,
        region: input.region,
        consecutiveYears,
        qualifies:
          !inProgress && consecutiveYears >= CONSECUTIVE_YEARS_THRESHOLD,
        onTrack,
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
      // Unknown (#1116 item 5) breaks the streak too: an unprovable year
      // can never count toward "3+ consecutive years Distinguished".
      if (!isDistinguishedTier(entry.tier)) break

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
