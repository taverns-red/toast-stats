/**
 * Zod contract for the education timeline (#2591, epic #2590).
 *
 * One object per program year, `derived/education-timeline/<PY>.json`: the
 * cumulative education-awards count at each snapshot date of the PY, for the
 * world, each region and each district, plus a prior-year "ghost". It feeds
 * the stacked step chart on the Education pages (#2592), modelled on the
 * Clubs RaceChart.
 *
 * Each point is the education rollup's block for that date, reduced to what
 * the chart stacks (#1801): `levels` L1..L5 (Pathways), `dtm`, `legacy`,
 * `other`, and `byPath` (Pathways totals per path code; sums to `levels`).
 * The chart's final point equals the KPI tiles because both come from the
 * same fold of the same reports.
 *
 * - **Absent, never zero.** A date a district has no reports for has no
 *   point in that district's series. Region and world points are summed over
 *   the districts present that date only; `districts` is that coverage.
 * - **Steps, never interpolated.** `dates` lists every snapshot date that has
 *   a point somewhere; a gap in the dates stays a gap.
 * - **Prior-year ghost** (`prior`): the previous PY's cumulative total at
 *   each of its points, per entity. `grain` says how fine it is: `day` (the
 *   prior PY's per-date reports, or its own timeline) keys `at` as
 *   YYYY-MM-DD; `month` (the staging-only education ledger history, month
 *   precision) keys `at` as YYYY-MM, the month-end cumulative. `null` where
 *   neither exists: "not available", not a zero line.
 * - **Privacy:** counts only. Every object is strict (Lesson 153).
 *
 * Additive only (ADR 0019): the education rollup index may name timelines
 * (`timelines`, optional) so the promotion plan promotes exactly what it
 * names. `derived/` is not a promoted prefix; the promote-reports job copies
 * it, content-gated against these schemas, like the rollup (#1810, #2222).
 *
 * @module education-timeline.schema
 */

import { z } from 'zod'

export const EDUCATION_TIMELINE_VERSION = '1.0.0'

/** The prefix the timelines live under, in both buckets. */
export const EDUCATION_TIMELINE_PREFIX = 'derived/education-timeline'

const ProgramYear = z
  .string()
  .regex(/^\d{4}-\d{4}$/)
  .refine(py => Number(py.slice(5)) === Number(py.slice(0, 4)) + 1, {
    message: 'program year must be consecutive years, e.g. 2018-2019',
  })

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const YearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
const Count = z.number().int().nonnegative()
const DistrictId = z.string().regex(/^[A-Za-z0-9]+$/)
const PathCode = z.string().regex(/^[A-Z]{2,3}$/)

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)

const pointShape = {
  date: IsoDate,
  /** Pathways awards at [L1, L2, L3, L4, L5]. */
  levels: z.tuple([Count, Count, Count, Count, Count]),
  dtm: Count,
  legacy: Count,
  other: Count,
  /** Pathways path code → awards across its levels. */
  byPath: z.record(PathCode, Count),
}

const byPathMatchesLevels = (p: {
  levels: readonly number[]
  byPath: Record<string, number>
}): boolean => sum(Object.values(p.byPath)) === sum(p.levels)
const BY_PATH = {
  message: 'byPath must sum to the Pathways levels',
  path: ['byPath'],
}

export const EducationTimelinePointSchema = z
  .object(pointShape)
  .strict()
  .refine(byPathMatchesLevels, BY_PATH)
export type EducationTimelinePoint = z.infer<
  typeof EducationTimelinePointSchema
>

export const EducationTimelineAggregatePointSchema = z
  .object({
    ...pointShape,
    /** The districts summed on this date (coverage). */
    districts: z.number().int().positive(),
  })
  .strict()
  .refine(byPathMatchesLevels, BY_PATH)
export type EducationTimelineAggregatePoint = z.infer<
  typeof EducationTimelineAggregatePointSchema
>

const GhostPointSchema = z
  .object({
    /** YYYY-MM-DD (grain `day`) or YYYY-MM (grain `month`). */
    at: z.string(),
    /** Cumulative awards (every program) as of `at`. */
    total: Count,
  })
  .strict()
export type EducationTimelineGhostPoint = z.infer<typeof GhostPointSchema>

export const EducationTimelineGrainSchema = z.enum(['day', 'month'])
export const EducationTimelinePriorSourceSchema = z.enum([
  /** The staging-only education ledger history (month precision). */
  'ledger-history',
  /** The prior PY's own timeline (built from its per-date reports). */
  'timeline',
])

const ascendingUnique = (keys: readonly string[]): boolean =>
  keys.every((k, i) => i === 0 || (keys[i - 1] as string) < k)

export const EducationTimelinePriorSchema = z
  .object({
    programYear: ProgramYear,
    source: EducationTimelinePriorSourceSchema,
    grain: EducationTimelineGrainSchema,
    world: z.array(GhostPointSchema),
    /** `null`: the prior PY had no region membership. */
    regions: z.record(z.string(), z.array(GhostPointSchema)).nullable(),
    districts: z.record(DistrictId, z.array(GhostPointSchema)),
  })
  .strict()
  .superRefine((p, ctx) => {
    const keyOk = p.grain === 'day' ? IsoDate : YearMonth
    const series = [
      p.world,
      ...Object.values(p.regions ?? {}),
      ...Object.values(p.districts),
    ]
    for (const s of series) {
      if (!s.every(g => keyOk.safeParse(g.at).success)) {
        ctx.addIssue({
          code: 'custom',
          message: `every ghost point's \`at\` must match grain ${p.grain}`,
        })
        return
      }
      if (!ascendingUnique(s.map(g => g.at))) {
        ctx.addIssue({
          code: 'custom',
          message: 'ghost points must be strictly ascending by `at`',
        })
        return
      }
    }
  })
export type EducationTimelinePrior = z.infer<
  typeof EducationTimelinePriorSchema
>

export const EducationTimelineSchema = z
  .object({
    _format: z
      .object({
        version: z.literal(EDUCATION_TIMELINE_VERSION),
        type: z.literal('education-timeline'),
      })
      .strict(),
    programYear: ProgramYear,
    /** The newest date with a point: the last of `dates`. */
    asOf: IsoDate,
    /** Every date with a point anywhere, ascending. */
    dates: z.array(IsoDate).min(1),
    world: z.array(EducationTimelineAggregatePointSchema),
    /** `null`: no region membership for this PY. */
    regions: z
      .record(z.string(), z.array(EducationTimelineAggregatePointSchema))
      .nullable(),
    districts: z.record(DistrictId, z.array(EducationTimelinePointSchema)),
    prior: EducationTimelinePriorSchema.nullable(),
  })
  .strict()
  .superRefine((t, ctx) => {
    const issue = (message: string): void =>
      ctx.addIssue({ code: 'custom', message })
    if (!ascendingUnique(t.dates)) issue('dates must be strictly ascending')
    if (t.asOf !== t.dates[t.dates.length - 1]) {
      issue('asOf must be the last of dates')
    }
    const listed = new Set(t.dates)
    const series = [
      t.world,
      ...Object.values(t.regions ?? {}),
      ...Object.values(t.districts),
    ]
    for (const s of series) {
      const ds = s.map(p => p.date)
      if (!ascendingUnique(ds)) {
        issue('points must be strictly ascending by date, one per date')
        return
      }
      if (ds.some(d => !listed.has(d))) {
        issue('every point must be on a listed date')
        return
      }
    }
    if (
      t.prior &&
      Number(t.prior.programYear.slice(0, 4)) !==
        Number(t.programYear.slice(0, 4)) - 1
    ) {
      issue('prior must be the previous program year')
    }
  })
export type EducationTimeline = z.infer<typeof EducationTimelineSchema>

/** `derived/education-timeline/<PY>.json` — validated, never raw input. */
export function educationTimelineObjectPath(programYear: string): string {
  ProgramYear.parse(programYear)
  return `${EDUCATION_TIMELINE_PREFIX}/${programYear}.json`
}

// ---- Stub (red): the per-entity contract lands in the next commit (#2591) ----
export type EducationTimelineEntity = {
  _format: { version: '1.0.0'; type: 'education-timeline-entity' }
  programYear: string
}
export const EducationTimelineEntitySchema = z.never()
export function educationTimelinePrefix(_py: string): string {
  throw new Error('not implemented')
}
export function educationTimelineEntityPath(
  _py: string,
  _kind: 'world' | 'region' | 'district',
  _id: string | null
): string {
  throw new Error('not implemented')
}
export function parseEducationTimelinePath(_path: string): {
  programYear: string
  kind: 'world' | 'region' | 'district'
  id: string | null
} | null {
  throw new Error('not implemented')
}
