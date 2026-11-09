/**
 * Zod contract for the education timeline (#2591, epic #2590).
 *
 * One object per ENTITY per program year, so a district page downloads its
 * own series and nothing else:
 *
 *   derived/education-timeline/<PY>/world.json
 *   derived/education-timeline/<PY>/region-<n>.json
 *   derived/education-timeline/<PY>/district-<id>.json
 *
 * Each holds that entity's cumulative education-awards count at each snapshot
 * date of the PY plus its own prior-year "ghost". It feeds the stacked step
 * chart on the Education pages (#2592), modelled on the Clubs RaceChart.
 *
 * Each point is the education rollup's block for that date, reduced to what
 * the chart stacks (#1801): `levels` L1..L5 (Pathways), `dtm`, `legacy`,
 * `other`, and `byPath` (Pathways totals per path code; sums to `levels`).
 * The chart's final point equals the KPI tiles because both come from the
 * same fold of the same reports.
 *
 * - **Absent, never zero.** A date a district has no reports for has no
 *   point in that district's file. World and region points are summed over
 *   the districts present that date only; `districts` is that coverage.
 * - **Steps, never interpolated.** Points are strictly ascending; a gap in
 *   the dates stays a gap.
 * - **Prior-year ghost** (`prior`): the previous PY's cumulative total at
 *   each of its points for this entity. `grain` says how fine it is: `day`
 *   (the prior PY's own timeline, built from its per-date reports) keys `at`
 *   as YYYY-MM-DD; `month` (the staging-only education ledger history, month
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

// ---------------------------------------------------------------------------
// Per-entity files (the published layout): one object per world / region /
// district, so a district page downloads its own series and nothing else.
//
//   derived/education-timeline/<PY>/world.json
//   derived/education-timeline/<PY>/region-<n>.json
//   derived/education-timeline/<PY>/district-<id>.json
//
// Each holds that entity's cumulative points and its own prior-year ghost.
// ---------------------------------------------------------------------------

export const EDUCATION_TIMELINE_ENTITY_VERSION = EDUCATION_TIMELINE_VERSION
export const EducationTimelineEntityKindSchema = z.enum([
  'world',
  'region',
  'district',
])
export type EducationTimelineEntityKind = z.infer<
  typeof EducationTimelineEntityKindSchema
>

const RegionId = z.string().regex(/^[A-Za-z0-9]+$/)

const EntityPriorSchema = z
  .object({
    programYear: ProgramYear,
    source: EducationTimelinePriorSourceSchema,
    grain: EducationTimelineGrainSchema,
    points: z.array(GhostPointSchema),
  })
  .strict()
  .superRefine((p, ctx) => {
    const keyOk = p.grain === 'day' ? IsoDate : YearMonth
    if (!p.points.every(g => keyOk.safeParse(g.at).success)) {
      ctx.addIssue({
        code: 'custom',
        message: `every ghost point's \`at\` must match grain ${p.grain}`,
      })
    } else if (!ascendingUnique(p.points.map(g => g.at))) {
      ctx.addIssue({
        code: 'custom',
        message: 'ghost points must be strictly ascending by `at`',
      })
    }
  })
export type EducationTimelineEntityPrior = z.infer<typeof EntityPriorSchema>

const entityBase = {
  _format: z
    .object({
      version: z.literal(EDUCATION_TIMELINE_VERSION),
      type: z.literal('education-timeline-entity'),
    })
    .strict(),
  programYear: ProgramYear,
  /** The newest date with a point: the last of `points`. */
  asOf: IsoDate,
  prior: EntityPriorSchema.nullable(),
}

const worldRef = z.object({ kind: z.literal('world'), id: z.null() }).strict()
const regionRef = z.object({ kind: z.literal('region'), id: RegionId }).strict()
const districtRef = z
  .object({ kind: z.literal('district'), id: DistrictId })
  .strict()

export const EducationTimelineEntitySchema = z
  .union([
    z
      .object({
        ...entityBase,
        entity: worldRef,
        points: z.array(EducationTimelineAggregatePointSchema).min(1),
      })
      .strict(),
    z
      .object({
        ...entityBase,
        entity: regionRef,
        points: z.array(EducationTimelineAggregatePointSchema).min(1),
      })
      .strict(),
    z
      .object({
        ...entityBase,
        entity: districtRef,
        points: z.array(EducationTimelinePointSchema).min(1),
      })
      .strict(),
  ])
  .superRefine((t, ctx) => {
    const issue = (message: string): void =>
      ctx.addIssue({ code: 'custom', message })
    if (!ascendingUnique(t.points.map(p => p.date))) {
      issue('points must be strictly ascending by date, one per date')
    }
    if (t.asOf !== t.points[t.points.length - 1]?.date) {
      issue('asOf must be the date of the last point')
    }
    if (
      t.prior &&
      Number(t.prior.programYear.slice(0, 4)) !==
        Number(t.programYear.slice(0, 4)) - 1
    ) {
      issue('prior must be the previous program year')
    }
  })
export type EducationTimelineEntity = z.infer<
  typeof EducationTimelineEntitySchema
>

const ENTITY_FILE =
  /^(world|region-([A-Za-z0-9]+)|district-([A-Za-z0-9]+))\.json$/

/** `derived/education-timeline/<PY>` (no trailing slash): a PY's prefix. */
export function educationTimelinePrefix(programYear: string): string {
  ProgramYear.parse(programYear)
  return `${EDUCATION_TIMELINE_PREFIX}/${programYear}`
}

/** The file name an entity is published under, inside its PY prefix. */
export function educationTimelineEntityFile(
  kind: EducationTimelineEntityKind,
  id: string | null
): string {
  if (kind === 'world') {
    if (id !== null) throw new Error('the world has no id')
    return 'world.json'
  }
  if (id === null) throw new Error(`a ${kind} needs an id`)
  RegionId.parse(id)
  return `${kind}-${id}.json`
}

/** `derived/education-timeline/<PY>/<file>` — validated, never raw input. */
export function educationTimelineEntityPath(
  programYear: string,
  kind: EducationTimelineEntityKind,
  id: string | null
): string {
  return `${educationTimelinePrefix(programYear)}/${educationTimelineEntityFile(kind, id)}`
}

const ENTITY_PATH = new RegExp(
  `^${EDUCATION_TIMELINE_PREFIX}/(\\d{4}-\\d{4})/([^/]+)$`
)

/**
 * The entity a published path names, or null for anything that is not one of
 * the three name patterns (so a stray object under the prefix is never read
 * as part of the timeline).
 */
export function parseEducationTimelinePath(path: string): {
  programYear: string
  kind: EducationTimelineEntityKind
  id: string | null
} | null {
  const m = ENTITY_PATH.exec(path)
  if (!m) return null
  const programYear = m[1] as string
  if (!ProgramYear.safeParse(programYear).success) return null
  const f = ENTITY_FILE.exec(m[2] as string)
  if (!f) return null
  if (f[1] === 'world') return { programYear, kind: 'world', id: null }
  if (f[2] !== undefined) return { programYear, kind: 'region', id: f[2] }
  return { programYear, kind: 'district', id: f[3] as string }
}
