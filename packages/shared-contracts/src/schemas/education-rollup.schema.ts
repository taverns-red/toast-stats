/**
 * Zod contract for the education rollup (#1801, epic #1781).
 *
 * Ledger only (Ron, 2026-10-11): every award counted is a row of TI's
 * education ledger — the archive ledger history for 2003-04 → 2018-19
 * (`raw-education-ledger/`, #1802) and the reports dataset's
 * `educationAchievements` from 2019-20 on (the archive backfill at each
 * year-end, the daily feed for the current PY). No dashboard-CSV proxy.
 *
 * One object per program year, `derived/education-rollup/<PY>.json`:
 * - `districts` — every district of that PY, each either `available` with
 *   its counts or `not-available` with a reason. Not available is never 0
 *   (a district TI had no ledger for is not a district with no awards).
 * - `regions` — the same counts summed over each region's districts, by
 *   that PY's OWN membership (`district-region-history`, #1820). `null` for
 *   a PY the region history does not cover (it starts in 2016-17).
 *   Districts with no region that year (F, U, a retired number) are in
 *   `regionsUnassigned` and counted in `world` only.
 * - `world` — summed over every available district.
 * Every aggregate names the districts it summed and the ones it could not,
 * so a missing district shortens the list visibly instead of reading as a
 * smaller total (per-row degradation).
 *
 * Plus `derived/education-rollup/index.json`: one row per PY (world totals,
 * coverage) and the multi-year trend per district and per region (#1807).
 *
 * Counting (Legacy and Pathways both counted, Ron 2026-10-11):
 * - `totals.awards` = every ledger award = pathways + legacy + dtm + other.
 *   DTM is counted once under its own code; `other` is a code nobody has
 *   mapped (e.g. PWMENTORPGM, or a blank pending award) — counted, never
 *   folded into a program by guesswork.
 * - `pathwaysMatrix` is Pathways only: path code → [L1, L2, L3, L4, L5];
 *   its cells sum to `totals.pathways`.
 * - `membersWithAward` — the daily feed's `educationMembers` summed over
 *   clubs (distinct members per club, Pathways levels + DTM); `null` where
 *   not measured (TI's archive has no member column). An aggregate is null
 *   unless every district it sums measured it: a partial sum would be a
 *   plausible wrong number.
 * - `tripleCrownAchievers` — likewise, from `tripleCrown.summary`.
 *
 * District numbers are per program year: TI has reused retired numbers
 * (D17, D20, D29, D41, D48 return in 2011-13 after a gap), so the same id in
 * two PYs is not proof of the same district.
 *
 * Privacy: counts only. Every object is strict, so no club, member or
 * per-row field (Lesson 153) can be carried.
 *
 * STAGING only until scoped promotion (#1763, ADR-015 step 5): `derived/`
 * is not a promoted prefix. Once the writer moves under a promoted prefix it
 * is promoted from the run manifest like the identity histories.
 *
 * @module education-rollup.schema
 */

import { z } from 'zod'

export const EDUCATION_ROLLUP_VERSION = '1.0.0'

/** The staging-only prefix the rollup lives under. */
export const EDUCATION_ROLLUP_PREFIX = 'derived/education-rollup'
export const EDUCATION_ROLLUP_INDEX_PATH = `${EDUCATION_ROLLUP_PREFIX}/index.json`

const ProgramYear = z
  .string()
  .regex(/^\d{4}-\d{4}$/)
  .refine(py => Number(py.slice(5)) === Number(py.slice(0, 4)) + 1, {
    message: 'program year must be consecutive years, e.g. 2018-2019',
  })

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Count = z.number().int().nonnegative()
const DistrictId = z.string().regex(/^[A-Za-z0-9]+$/)

export const EducationAwardTotalsSchema = z
  .object({
    /** Every ledger award: the sum of the four programs. */
    awards: Count,
    pathways: Count,
    legacy: Count,
    dtm: Count,
    other: Count,
  })
  .strict()
  .refine(t => t.awards === t.pathways + t.legacy + t.dtm + t.other, {
    message: 'awards must equal pathways + legacy + dtm + other',
    path: ['awards'],
  })
export type EducationAwardTotals = z.infer<typeof EducationAwardTotalsSchema>

/** Path code (`PM`, `CES`) → awards at [L1, L2, L3, L4, L5]. */
export const PathwaysMatrixSchema = z.record(
  z.string().regex(/^[A-Z]{2,3}$/),
  z.tuple([Count, Count, Count, Count, Count])
)

const CodeCounts = z.record(z.string(), z.number().int().positive())

const awardsBlockShape = {
  totals: EducationAwardTotalsSchema,
  pathwaysMatrix: PathwaysMatrixSchema,
  /** Legacy award code → awards. */
  legacyByCode: CodeCounts,
  /** Unmapped code → awards; `''` is a blank (pending) code. */
  otherByCode: CodeCounts,
  /** Distinct clubs with at least one award (any program). */
  clubsWithAward: Count,
  /** `null` = not measured (archive years), never 0. */
  membersWithAward: Count.nullable(),
  /** `null` = not measured, never 0. */
  tripleCrownAchievers: Count.nullable(),
}

type AwardsBlockLike = {
  totals: EducationAwardTotals
  pathwaysMatrix: Record<string, number[]>
  legacyByCode: Record<string, number>
  otherByCode: Record<string, number>
}

const sum = (xs: Iterable<number>): number => {
  let s = 0
  for (const x of xs) s += x
  return s
}

/** The breakdowns must add up to the totals they break down. */
function blockAddsUp(b: AwardsBlockLike): boolean {
  return (
    sum(Object.values(b.pathwaysMatrix).flat()) === b.totals.pathways &&
    sum(Object.values(b.legacyByCode)) === b.totals.legacy &&
    sum(Object.values(b.otherByCode)) === b.totals.other
  )
}
const ADDS_UP = {
  message:
    'pathwaysMatrix, legacyByCode and otherByCode must sum to their totals',
}

export const EducationAwardsBlockSchema = z
  .object(awardsBlockShape)
  .strict()
  .refine(blockAddsUp, ADDS_UP)
export type EducationAwardsBlock = z.infer<typeof EducationAwardsBlockSchema>

export const EducationNotAvailableReasonSchema = z.enum([
  /** TI returned an empty ledger body (the archive's "no such district"). */
  'no-data',
  /** The district is in that PY's district list but no ledger file exists. */
  'no-file',
  /** The reports dataset exists but carries no educationAchievements. */
  'no-education-section',
  /** The dataset's programYear disagrees with its snapshot's logical date. */
  'program-year-mismatch',
])

export const EducationRollupDistrictSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('available'),
      /** That PY's region, or null when it had none. */
      region: z.string().nullable(),
      awards: EducationAwardsBlockSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('not-available'),
      region: z.string().nullable(),
      reason: EducationNotAvailableReasonSchema,
    })
    .strict(),
])
export type EducationRollupDistrict = z.infer<
  typeof EducationRollupDistrictSchema
>

export const EducationRollupAggregateSchema = z
  .object({
    ...awardsBlockShape,
    /** The districts summed, sorted. */
    districtsAvailable: z.array(DistrictId),
    /** The districts in scope that could not be summed, sorted. */
    districtsNotAvailable: z.array(DistrictId),
  })
  .strict()
  .refine(blockAddsUp, ADDS_UP)
export type EducationRollupAggregate = z.infer<
  typeof EducationRollupAggregateSchema
>

export const EducationRollupSourceSchema = z.enum([
  /** raw-education-ledger/<PY>/ (#1802). */
  'ledger-history',
  /** snapshots/<sourceDate>/district_<id>_reports.json. */
  'reports',
])

export const EducationRollupProgramYearSchema = z
  .object({
    _format: z
      .object({
        version: z.literal(EDUCATION_ROLLUP_VERSION),
        type: z.literal('education-rollup'),
      })
      .strict(),
    programYear: ProgramYear,
    source: EducationRollupSourceSchema,
    /** The snapshot date the reports were read from; null for the ledger. */
    sourceDate: IsoDate.nullable(),
    districts: z.record(DistrictId, EducationRollupDistrictSchema),
    /** Region → aggregate; null = no region membership for this PY. */
    regions: z.record(z.string(), EducationRollupAggregateSchema).nullable(),
    /** Districts counted in `world` but in no region this PY, sorted. */
    regionsUnassigned: z.array(DistrictId),
    world: EducationRollupAggregateSchema,
  })
  .strict()
  .refine(r => (r.source === 'reports') === (r.sourceDate !== null), {
    message: 'sourceDate is set exactly when source is reports',
    path: ['sourceDate'],
  })
export type EducationRollupProgramYear = z.infer<
  typeof EducationRollupProgramYearSchema
>

export const EducationRollupIndexSchema = z
  .object({
    _format: z
      .object({
        version: z.literal(EDUCATION_ROLLUP_VERSION),
        type: z.literal('education-rollup-index'),
      })
      .strict(),
    /** The newest reports snapshot date read; null if none was. */
    asOf: IsoDate.nullable(),
    /** Ascending by program year. */
    programYears: z.array(
      z
        .object({
          programYear: ProgramYear,
          source: EducationRollupSourceSchema,
          sourceDate: IsoDate.nullable(),
          /** The per-PY object. */
          path: z.string(),
          world: EducationAwardTotalsSchema,
          districtsAvailable: Count,
          districtsNotAvailable: Count,
        })
        .strict()
    ),
    /** Program years with no rollup at all (e.g. no reports at any date),
     *  ascending: "not available", never a zero year (#1807). */
    omittedProgramYears: z.array(
      z.object({ programYear: ProgramYear, reason: z.string() }).strict()
    ),
    trend: z
      .object({
        /** District → PY → totals; null = not available that PY. A PY the
         *  district was not in is absent. */
        districts: z.record(
          DistrictId,
          z.record(ProgramYear, EducationAwardTotalsSchema.nullable())
        ),
        /** Region → PY → totals over that PY's available districts. */
        regions: z.record(
          z.string(),
          z.record(ProgramYear, EducationAwardTotalsSchema)
        ),
      })
      .strict(),
  })
  .strict()
export type EducationRollupIndex = z.infer<typeof EducationRollupIndexSchema>

/** `derived/education-rollup/<PY>.json` — validated, never raw input. */
export function educationRollupObjectPath(programYear: string): string {
  ProgramYear.parse(programYear)
  return `${EDUCATION_ROLLUP_PREFIX}/${programYear}.json`
}
