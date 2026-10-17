/**
 * Zod contract for the per-district charter cohort survival file (#2061;
 * the page is #1817, epic #1781).
 *
 * "Of the clubs chartered here in program year X, how many are still active
 * 1, 3, 5 years later?" The page used to fold this in the browser from all
 * 100 club-district history shards (~1.2 MB gzipped), over the mobile
 * route budget (#1827). The pipeline now folds it once per district, with
 * the same function the page used (`buildCharterCohortSurvival`), and writes
 * the curves for every program year the history covers: the page's
 * program-year control (R3) picks one, with no re-computation.
 *
 * Path: `config/charter-cohort-survival/district_<id>.json`
 * (`charterCohortSurvivalObjectPath`), plain JSON, `max-age=300`,
 * edge-compressed, promoted with the run like the history it derives from.
 *
 * Rules (the same as the in-browser fold, #2059):
 * - a club that moved district is surviving, not closed;
 * - the first folded program year (the data starts mid-year) is
 *   left-censored and never a cohort (`censoredProgramYear`);
 * - a year not reached yet is `null`, never 0.
 *
 * @module charter-cohort-survival.schema
 */

import { z } from 'zod'

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const ProgramYear = z.string().regex(/^\d{4}-\d{4}$/)
const Count = z.number().int().nonnegative()
const Share = z.number().min(0).max(1)

export const CHARTER_COHORT_SURVIVAL_VERSION = '1.0.0'

/** A district id that can name an object (no `/`, no `..`). */
const DISTRICT_ID = /^[A-Za-z0-9]+$/

export const CohortYearCellSchema = z.object({
  /** The program year this cell measures (charter PY + k). */
  programYear: ProgramYear,
  survivors: Count,
  /** survivors / chartered, 0–1. */
  share: Share,
  /** The program year is still in progress: a club can still close. */
  provisional: z.boolean(),
})

export const CharterCohortSchema = z.object({
  /** The charter program year, e.g. "2019-2020". */
  programYear: ProgramYear,
  chartered: Count,
  /** Survivors whose district in their latest PY (≤ through) is another one. */
  movedAway: Count,
  /** Index k-1 holds year k; `null` = not reached yet (or no clubs). */
  years: z.array(CohortYearCellSchema.nullable()),
})

export const PooledYearCellSchema = z.object({
  chartered: Count,
  survivors: Count,
  share: Share,
  provisional: z.boolean(),
})

/** The curves for one selected ("through") program year. */
export const CharterCohortCurvesSchema = z.object({
  /** The longest reachable horizon in years. */
  maxYears: Count,
  /** Ascending by charter PY; includes PYs with no charters (chartered 0). */
  cohorts: z.array(CharterCohortSchema),
  /** Index k-1: every cohort that has reached year k, pooled. */
  pooled: z.array(PooledYearCellSchema.nullable()),
})

export const CharterCohortSurvivalFileSchema = z.object({
  _format: z.object({
    version: z.string(),
    type: z.literal('charter-cohort-survival'),
  }),
  districtId: z.string().regex(DISTRICT_ID),
  /** The club-district history's `asOf`. */
  asOf: IsoDate,
  /** The history's program years, ascending. */
  programYears: z.array(ProgramYear),
  /** The left-censored first program year, never shown as a cohort. */
  censoredProgramYear: ProgramYear.nullable(),
  /** One entry per program year in `programYears`. */
  byThroughProgramYear: z.record(ProgramYear, CharterCohortCurvesSchema),
})

export type CohortYearCell = z.infer<typeof CohortYearCellSchema>
export type CharterCohort = z.infer<typeof CharterCohortSchema>
export type PooledYearCell = z.infer<typeof PooledYearCellSchema>
export type CharterCohortCurves = z.infer<typeof CharterCohortCurvesSchema>
export type CharterCohortSurvivalFile = z.infer<
  typeof CharterCohortSurvivalFileSchema
>

export const CHARTER_COHORT_SURVIVAL_DIR = 'config/charter-cohort-survival/'

/** `config/charter-cohort-survival/district_<id>.json`; throws on an unsafe id. */
export function charterCohortSurvivalObjectPath(districtId: string): string {
  if (!DISTRICT_ID.test(districtId)) {
    throw new Error(
      `charterCohortSurvivalObjectPath: unsafe district id '${districtId}'`
    )
  }
  return `${CHARTER_COHORT_SURVIVAL_DIR}district_${districtId}.json`
}

/* ── Region and world rollups (#1818) ─────────────────────────────────── */

/** A two-digit region id, as the rankings and region-rollups key it. */
const REGION_ID = /^\d{2}$/

export const CharterCohortSurvivalScopeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('region'),
    regionId: z.string().regex(REGION_ID),
  }),
  z.object({ kind: z.literal('world') }),
])

/**
 * One region's, or the world's, charter cohort survival (#1818):
 * `config/charter-cohort-survival/region_<NN>.json` and `.../world.json`,
 * folded by the pipeline from the same club-district history as the
 * district files, with the same rules. A club is in a region's cohort when
 * its district sat in that region in the club's charter program year
 * (`config/district-region-history.json`, each year's own membership);
 * `movedAway` counts the members whose latest region is another one,
 * whether the club moved or its district was redrawn. The world has
 * nowhere to move away to.
 */
export const CharterCohortSurvivalRollupFileSchema = z.object({
  _format: z.object({
    version: z.string(),
    type: z.literal('charter-cohort-survival-rollup'),
  }),
  scope: CharterCohortSurvivalScopeSchema,
  /** The club-district history's `asOf`. */
  asOf: IsoDate,
  /** The history's program years, ascending. */
  programYears: z.array(ProgramYear),
  /** The left-censored first program year, never shown as a cohort. */
  censoredProgramYear: ProgramYear.nullable(),
  /** One entry per program year in `programYears`. */
  byThroughProgramYear: z.record(ProgramYear, CharterCohortCurvesSchema),
})

export type CharterCohortSurvivalScope = z.infer<
  typeof CharterCohortSurvivalScopeSchema
>
export type CharterCohortSurvivalRollupFile = z.infer<
  typeof CharterCohortSurvivalRollupFileSchema
>

/**
 * `config/charter-cohort-survival/region_<NN>.json` or `.../world.json`;
 * throws on a region id that is not two digits.
 */
export function charterCohortSurvivalRollupObjectPath(
  scope: CharterCohortSurvivalScope
): string {
  if (scope.kind === 'world') return `${CHARTER_COHORT_SURVIVAL_DIR}world.json`
  if (!REGION_ID.test(scope.regionId)) {
    throw new Error(
      `charterCohortSurvivalRollupObjectPath: unsafe region id '${scope.regionId}'`
    )
  }
  return `${CHARTER_COHORT_SURVIVAL_DIR}region_${scope.regionId}.json`
}
