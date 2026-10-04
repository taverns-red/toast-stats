/**
 * ClubStrengthAwardCalculator (#333)
 *
 * District Club Strength Award: any district achieving 10%+ growth in
 * average club size year-over-year earns this award.
 *
 * avgClubSize = totalMembership / activeClubs
 * growthPercent = ((current - prior) / prior) * 100
 *
 * Source: Item 1490, Rev. 04/2025. TI dropped the award from Rev. 03/2026;
 * it is still computed and shown for every program year with that note
 * (#1613, product decision).
 *
 * The undistricted `U` bucket is not a district and cannot receive a
 * district award, so it never ranks or qualifies (#1613).
 */

export interface ClubStrengthInput {
  districtId: string
  districtName: string
  region: string
  currentAvgClubSize: number
  priorYearAvgClubSize: number | null
}

export interface ClubStrengthResult {
  districtId: string
  districtName: string
  region: string
  currentAvgClubSize: number
  priorYearAvgClubSize: number | null
  growthPercent: number | null
  qualifies: boolean
}

export interface ClubStrengthAwardStandings {
  qualifyingDistricts: ClubStrengthResult[]
  allDistricts: ClubStrengthResult[]
}

const GROWTH_THRESHOLD = 10

/** The undistricted bucket's ranking id — a row, but not a district. */
const UNDISTRICTED_ID = 'U'

export class ClubStrengthAwardCalculator {
  calculate(inputs: ClubStrengthInput[]): ClubStrengthAwardStandings {
    const districts = inputs.filter(i => i.districtId !== UNDISTRICTED_ID)
    const allDistricts: ClubStrengthResult[] = districts.map(input => {
      const growthPercent = this.computeGrowth(
        input.currentAvgClubSize,
        input.priorYearAvgClubSize
      )
      return {
        districtId: input.districtId,
        districtName: input.districtName,
        region: input.region,
        currentAvgClubSize: input.currentAvgClubSize,
        priorYearAvgClubSize: input.priorYearAvgClubSize,
        growthPercent,
        qualifies: growthPercent !== null && growthPercent >= GROWTH_THRESHOLD,
      }
    })

    allDistricts.sort(
      (a, b) => (b.growthPercent ?? -Infinity) - (a.growthPercent ?? -Infinity)
    )

    return {
      qualifyingDistricts: allDistricts.filter(d => d.qualifies),
      allDistricts,
    }
  }

  private computeGrowth(current: number, prior: number | null): number | null {
    if (prior === null || prior <= 0) return null
    return ((current - prior) / prior) * 100
  }
}
