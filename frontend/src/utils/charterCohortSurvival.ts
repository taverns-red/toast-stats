/* Charter cohort survival (#1817, epic #1781). The fold lives in
   shared-contracts (#2061), so the pipeline writes the per-district file
   (`config/charter-cohort-survival/district_<id>.json`) with the same
   function the page falls back to when that file is missing. */

export {
  buildCharterCohortSurvival,
  charterCohortSurvivalFromFile,
  type BuildCharterCohortSurvivalInput,
  type CharterCohort,
  type CharterCohortSurvival,
  type CohortYearCell,
  type PooledYearCell,
} from '@taverns-red/shared-contracts'

/** "2019-2020" → "2019-20". */
export const shortProgramYear = (py: string): string =>
  `${py.slice(0, 4)}-${py.slice(7, 9)}`
