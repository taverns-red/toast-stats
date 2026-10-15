import type {
  ClubDistrictHistoryClub,
  ClubDistrictHistoryIndex,
} from '@taverns-red/shared-contracts'

/* Charter cohort survival (#1817, epic #1781).

   "Of the clubs chartered in program year X, how many are still active 1, 3,
   5 years later?" — folded from the club-district history (#1782), where the
   club is the key and the district an attribute per program year, so a club
   that moved district keeps its past.

   Definitions (the history is program-year granular, Phase 1):
   - A club's charter year is the first program year it is seen in
     (`byProgramYear`'s earliest key — already a logical PY, never a
     collection date). Checked against the snapshot `charterDate` of D61's
     active clubs: 33 of 33 agree.
   - The district's cohort for PY X is the clubs whose charter year is X and
     whose district that year was this district.
   - The first folded program year is left-censored — the data starts
     mid-year, so its "first seen" clubs include every club chartered before
     it. It is reported as `censoredProgramYear` and never shown as a cohort.
   - A club survives year k while it is seen in PY X+k or later, in any
     district: a club that moved district is surviving, not closed.
   - Year k is reachable only when PY X+k is no later than the program year
     the page controls select (R3) and the history covers it. Unreached years
     are `null`, never 0. A year that is the in-progress program year (the
     history's `asOf` falls before its June 30 close) is `provisional`. */

export interface CohortYearCell {
  /** The program year this cell measures (charter PY + k). */
  programYear: string
  survivors: number
  /** survivors / chartered, 0–1. */
  share: number
  /** The program year is still in progress: a club can still close. */
  provisional: boolean
}

export interface CharterCohort {
  /** The charter program year, e.g. "2019-2020". */
  programYear: string
  chartered: number
  /** Survivors whose district in their latest PY (≤ through) is another one. */
  movedAway: number
  /** Index k-1 holds year k; `null` = not reached yet (or no clubs). */
  years: (CohortYearCell | null)[]
}

export interface PooledYearCell {
  chartered: number
  survivors: number
  share: number
  provisional: boolean
}

export interface CharterCohortSurvival {
  districtId: string
  throughProgramYear: string
  asOf: string
  /** The longest reachable horizon in years. */
  maxYears: number
  /** Ascending by charter PY; includes PYs with no charters (chartered 0). */
  cohorts: CharterCohort[]
  /** Index k-1: every cohort that has reached year k, pooled. */
  pooled: (PooledYearCell | null)[]
  /** The left-censored first program year, never shown as a cohort. */
  censoredProgramYear: string | null
}

export interface BuildCharterCohortSurvivalInput {
  index: Pick<ClubDistrictHistoryIndex, 'programYears' | 'asOf'>
  clubs: Record<string, ClubDistrictHistoryClub>
  districtId: string
  /** The program year selected in the page controls, "YYYY-YYYY". */
  throughProgramYear: string
}

/** "2026-2027" → "2027-06-30", the program year's close. */
function programYearClose(programYear: string): string {
  return `${programYear.slice(5, 9)}-06-30`
}

export function buildCharterCohortSurvival({
  index,
  clubs,
  districtId,
  throughProgramYear,
}: BuildCharterCohortSurvivalInput): CharterCohortSurvival {
  const programYears = [...index.programYears].sort()
  const censoredProgramYear = programYears[0] ?? null
  const reachable = programYears.filter(py => py <= throughProgramYear)
  const lastIndex = reachable.length - 1
  const isProvisional = (py: string) =>
    py === programYears[programYears.length - 1] &&
    index.asOf < programYearClose(py)

  // Cohort members by charter PY, with each one's latest PY ≤ through.
  const members = new Map<string, { lastPy: string; lastDistrict: string }[]>()
  for (const club of Object.values(clubs)) {
    const seen = Object.keys(club.byProgramYear).sort()
    const charterPy = seen[0]
    if (!charterPy || charterPy === censoredProgramYear) continue
    if (charterPy > throughProgramYear) continue
    if (club.byProgramYear[charterPy] !== districtId) continue
    const within = seen.filter(py => py <= throughProgramYear)
    const lastPy = within[within.length - 1] ?? charterPy
    const list = members.get(charterPy) ?? []
    list.push({ lastPy, lastDistrict: club.byProgramYear[lastPy] ?? '' })
    members.set(charterPy, list)
  }

  const cohorts: CharterCohort[] = []
  let maxYears = 0
  reachable.forEach((charterPy, i) => {
    if (charterPy === censoredProgramYear) return
    const list = members.get(charterPy) ?? []
    const horizon = lastIndex - i
    maxYears = Math.max(maxYears, horizon)
    const years: (CohortYearCell | null)[] = []
    for (let k = 1; k <= horizon; k++) {
      const py = reachable[i + k] as string
      if (list.length === 0) {
        years.push(null)
        continue
      }
      const survivors = list.filter(m => m.lastPy >= py).length
      years.push({
        programYear: py,
        survivors,
        share: survivors / list.length,
        provisional: isProvisional(py),
      })
    }
    cohorts.push({
      programYear: charterPy,
      chartered: list.length,
      movedAway: list.filter(m => m.lastDistrict !== districtId).length,
      years,
    })
  })

  for (const c of cohorts) {
    while (c.years.length < maxYears) c.years.push(null)
  }

  const pooled: (PooledYearCell | null)[] = []
  for (let k = 0; k < maxYears; k++) {
    let chartered = 0
    let survivors = 0
    let provisional = false
    for (const c of cohorts) {
      const cell = c.years[k]
      if (!cell) continue
      chartered += c.chartered
      survivors += cell.survivors
      provisional ||= cell.provisional
    }
    pooled.push(
      chartered === 0
        ? null
        : { chartered, survivors, share: survivors / chartered, provisional }
    )
  }

  return {
    districtId,
    throughProgramYear,
    asOf: index.asOf,
    maxYears,
    cohorts,
    pooled,
    censoredProgramYear,
  }
}
