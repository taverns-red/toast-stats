import type {
  ClubDistrictHistoryClub,
  ClubDistrictHistoryIndex,
} from '../schemas/club-district-history.schema.js'
import {
  CHARTER_COHORT_SURVIVAL_VERSION,
  type CharterCohort,
  type CharterCohortCurves,
  type CharterCohortSurvivalFile,
  type CharterCohortSurvivalRollupFile,
  type CharterCohortSurvivalScope,
  type CohortYearCell,
  type PooledYearCell,
} from '../schemas/charter-cohort-survival.schema.js'
import type { DistrictRegionHistory } from '../schemas/district-region-history.schema.js'

/* Charter cohort survival (#1817, epic #1781; moved here from the frontend
   by #2061 so the pipeline and the page share one fold).

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

export interface CharterCohortSurvival extends CharterCohortCurves {
  districtId: string
  throughProgramYear: string
  asOf: string
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
  const { maxYears, cohorts, pooled, censoredProgramYear } = foldCohortCurves({
    index,
    clubs,
    throughProgramYear,
    inScope: district => district === districtId,
  })
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

/**
 * The one fold behind the district, region and world curves (#1818).
 * `inScope(district, py)` says whether a club in `district` in program
 * year `py` belongs to the scope: a club joins a cohort when it is in
 * scope in its charter year, and counts as moved away when it is out of
 * scope in its latest year (≤ through).
 */
function foldCohortCurves({
  index,
  clubs,
  throughProgramYear,
  inScope,
}: {
  index: Pick<ClubDistrictHistoryIndex, 'programYears' | 'asOf'>
  clubs: Record<string, ClubDistrictHistoryClub>
  throughProgramYear: string
  inScope: (districtId: string, programYear: string) => boolean
}): CharterCohortCurves & { censoredProgramYear: string | null } {
  const programYears = [...index.programYears].sort()
  const censoredProgramYear = programYears[0] ?? null
  const reachable = programYears.filter(py => py <= throughProgramYear)
  const lastIndex = reachable.length - 1
  const isProvisional = (py: string): boolean =>
    py === programYears[programYears.length - 1] &&
    index.asOf < programYearClose(py)

  // Cohort members by charter PY, with each one's latest PY ≤ through.
  const members = new Map<string, { lastPy: string; movedAway: boolean }[]>()
  for (const club of Object.values(clubs)) {
    const seen = Object.keys(club.byProgramYear).sort()
    const charterPy = seen[0]
    if (!charterPy || charterPy === censoredProgramYear) continue
    if (charterPy > throughProgramYear) continue
    if (!inScope(club.byProgramYear[charterPy] ?? '', charterPy)) continue
    const within = seen.filter(py => py <= throughProgramYear)
    const lastPy = within[within.length - 1] ?? charterPy
    const list = members.get(charterPy) ?? []
    list.push({
      lastPy,
      movedAway: !inScope(club.byProgramYear[lastPy] ?? '', lastPy),
    })
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
      movedAway: list.filter(m => m.movedAway).length,
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

  return { maxYears, cohorts, pooled, censoredProgramYear }
}

export interface BuildCharterCohortSurvivalFileInput {
  index: Pick<ClubDistrictHistoryIndex, 'programYears' | 'asOf'>
  /** Every club the district's cohorts can hold (all clubs is fine). */
  clubs: Record<string, ClubDistrictHistoryClub>
  districtId: string
}

/**
 * The district's file (#2061): the curves through every program year the
 * history covers, so any program year the page controls select is a lookup.
 */
export function buildCharterCohortSurvivalFile({
  index,
  clubs,
  districtId,
}: BuildCharterCohortSurvivalFileInput): CharterCohortSurvivalFile {
  const programYears = [...index.programYears].sort()
  const byThroughProgramYear: Record<string, CharterCohortCurves> = {}
  for (const through of programYears) {
    const { maxYears, cohorts, pooled } = buildCharterCohortSurvival({
      index,
      clubs,
      districtId,
      throughProgramYear: through,
    })
    byThroughProgramYear[through] = { maxYears, cohorts, pooled }
  }
  return {
    _format: {
      version: CHARTER_COHORT_SURVIVAL_VERSION,
      type: 'charter-cohort-survival',
    },
    districtId,
    asOf: index.asOf,
    programYears,
    censoredProgramYear: programYears[0] ?? null,
    byThroughProgramYear,
  }
}

/**
 * The curves through `throughProgramYear`, read from the file: the entry of
 * the latest covered program year at or before it (a later selection
 * reaches no further than the history does), or no cohorts when it precedes
 * the history. Equal to `buildCharterCohortSurvival` over the same history.
 */
export function charterCohortSurvivalFromFile(
  file: CharterCohortSurvivalFile,
  throughProgramYear: string
): CharterCohortSurvival {
  const curves = curvesThrough(file, throughProgramYear)
  return {
    districtId: file.districtId,
    throughProgramYear,
    asOf: file.asOf,
    maxYears: curves.maxYears,
    cohorts: curves.cohorts,
    pooled: curves.pooled,
    censoredProgramYear: file.censoredProgramYear,
  }
}

function curvesThrough(
  file: Pick<
    CharterCohortSurvivalFile,
    'programYears' | 'byThroughProgramYear'
  >,
  throughProgramYear: string
): CharterCohortCurves {
  const covered = [...file.programYears]
    .sort()
    .filter(py => py <= throughProgramYear)
  const key = covered[covered.length - 1]
  return (
    (key && file.byThroughProgramYear[key]) || {
      maxYears: 0,
      cohorts: [],
      pooled: [],
    }
  )
}

/* ── Region and world rollups (#1818) ─────────────────────────────────── */

/** The rollup curves: the district shape, scoped to a region or the world. */
export interface CharterCohortSurvivalRollup extends CharterCohortCurves {
  scope: CharterCohortSurvivalScope
  throughProgramYear: string
  asOf: string
  /** The left-censored first program year, never shown as a cohort. */
  censoredProgramYear: string | null
}

export interface BuildCharterCohortSurvivalRollupInput {
  index: Pick<ClubDistrictHistoryIndex, 'programYears' | 'asOf'>
  /** Every club the scope's cohorts can hold (all clubs is fine). */
  clubs: Record<string, ClubDistrictHistoryClub>
  /** Each program year's own district → region membership (#1820). */
  regionHistory: Pick<DistrictRegionHistory, 'districts'>
  scope: CharterCohortSurvivalScope
  /** The program year selected in the page controls, "YYYY-YYYY". */
  throughProgramYear: string
}

/** Whether a club in `districtId` in `programYear` belongs to the scope. */
export function charterCohortScopeTest(
  scope: CharterCohortSurvivalScope,
  regionHistory: Pick<DistrictRegionHistory, 'districts'>
): (districtId: string, programYear: string) => boolean {
  if (scope.kind === 'world') return () => true
  return (districtId, programYear) =>
    regionHistory.districts[districtId]?.byProgramYear[programYear] ===
    scope.regionId
}

/**
 * A region's or the world's curves (#1818), with the district fold's
 * rules. A club is in a region's cohort when its district sat in that
 * region in the club's charter program year; a district the region history
 * does not name that year is in no region (it is still in the world).
 */
export function buildCharterCohortSurvivalRollup({
  index,
  clubs,
  regionHistory,
  scope,
  throughProgramYear,
}: BuildCharterCohortSurvivalRollupInput): CharterCohortSurvivalRollup {
  const { maxYears, cohorts, pooled, censoredProgramYear } = foldCohortCurves({
    index,
    clubs,
    throughProgramYear,
    inScope: charterCohortScopeTest(scope, regionHistory),
  })
  return {
    scope,
    throughProgramYear,
    asOf: index.asOf,
    maxYears,
    cohorts,
    pooled,
    censoredProgramYear,
  }
}

/** The rollup file (#1818): the curves through every covered program year. */
export function buildCharterCohortSurvivalRollupFile({
  index,
  clubs,
  regionHistory,
  scope,
}: Omit<
  BuildCharterCohortSurvivalRollupInput,
  'throughProgramYear'
>): CharterCohortSurvivalRollupFile {
  const programYears = [...index.programYears].sort()
  const inScope = charterCohortScopeTest(scope, regionHistory)
  const byThroughProgramYear: Record<string, CharterCohortCurves> = {}
  for (const through of programYears) {
    const { maxYears, cohorts, pooled } = foldCohortCurves({
      index,
      clubs,
      throughProgramYear: through,
      inScope,
    })
    byThroughProgramYear[through] = { maxYears, cohorts, pooled }
  }
  return {
    _format: {
      version: CHARTER_COHORT_SURVIVAL_VERSION,
      type: 'charter-cohort-survival-rollup',
    },
    scope,
    asOf: index.asOf,
    programYears,
    censoredProgramYear: programYears[0] ?? null,
    byThroughProgramYear,
  }
}

/** The rollup curves through `throughProgramYear`, read from its file. */
export function charterCohortSurvivalFromRollupFile(
  file: CharterCohortSurvivalRollupFile,
  throughProgramYear: string
): CharterCohortSurvivalRollup {
  const curves = curvesThrough(file, throughProgramYear)
  return {
    scope: file.scope,
    throughProgramYear,
    asOf: file.asOf,
    maxYears: curves.maxYears,
    cohorts: curves.cohorts,
    pooled: curves.pooled,
    censoredProgramYear: file.censoredProgramYear,
  }
}
