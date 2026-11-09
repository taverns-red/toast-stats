/**
 * Bands and the prior-year ghost for the Education timeline chart (#2592,
 * epic #2590). Pure: the artifact's cumulative points in, chart rows out.
 *
 * The chart is a stacked cumulative STEP chart (the Clubs RaceChart's
 * grammar), so a row exists only for a date the artifact has a point for --
 * nothing is interpolated across a gap.
 *
 * - **Level mode** stacks L1..L5 and DTM. Legacy and Other awards join only
 *   when some point carries them, so the stack equals the KPI tile total
 *   (every award, whatever its program) and a quiet year shows six bands.
 * - **Path mode** stacks the top 6 Pathways paths by FINAL total plus
 *   "Other", which folds in the remaining paths, DTMs and legacy so the
 *   stack still equals the tile total.
 * - **Colour follows the entity.** A band's `colour` names the level or the
 *   path, never its rank, so a path keeps its colour when the selection
 *   changes. The stylesheet maps the hook to a (light/dark) value.
 * - **The ghost** is the prior program year's cumulative total at the same
 *   point in the program year: aligned by day-of-PY, then the last prior
 *   observation on or before it (day grain) or the last month-end on or
 *   before it (month grain). Before the prior year had anything, null: a
 *   gap, not a zero.
 */
import type {
  EducationTimelineAggregatePoint,
  EducationTimelineEntity,
  EducationTimelinePoint,
} from '@taverns-red/shared-contracts'
import { PATHWAYS_PATHS } from './districtEducation'

export type TimelineMode = 'level' | 'path'
export type TimelineSourcePoint =
  EducationTimelinePoint | EducationTimelineAggregatePoint
export type TimelinePrior = EducationTimelineEntity['prior']

export interface TimelineBand {
  /** The chart's dataKey. */
  key: string
  label: string
  /** Colour hook (`edu-tl--<colour>` in the stylesheet): follows the entity. */
  colour: string
}

export interface TimelineRow {
  date: string
  /** Every award, whatever its program: the stack's height. */
  total: number
  /** Last year's cumulative total at the same point; null = no data yet. */
  ghost: number | null
  /** Band key → cumulative awards. */
  values: Record<string, number>
}

/** How last year is drawn: not at all, as a same-date curve, or as one
 *  horizontal line at last year's (year-end) total. */
export type GhostKind = 'none' | 'curve' | 'target'

export interface DerivedTimeline {
  bands: TimelineBand[]
  rows: TimelineRow[]
  ghostKind: GhostKind
  /** The target line's total and the date it was observed (`target` only). */
  target: { total: number; at: string } | null
}

/** Paths shown by name in path mode; the rest fold into "Other". */
export const TOP_PATHS = 6

const LEVEL_KEYS = ['L1', 'L2', 'L3', 'L4', 'L5'] as const
const REST_KEY = 'rest'
/** The rest band is the total minus the top paths, so it holds DTMs and
 *  legacy awards too; the label says so. */
const REST_LABEL = 'All other awards (incl. DTM)'

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0)
const totalOf = (p: TimelineSourcePoint): number =>
  sum(p.levels) + p.dtm + p.legacy + p.other

const pathTitle = (code: string): string =>
  PATHWAYS_PATHS.find(p => p.code === code)?.title ?? code

/* ── Dates (UTC, so a DST change never moves a day) ─────────────────── */

const DAY_MS = 86_400_000

const utc = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d)
}

const isoOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/** Midnight UTC of a `YYYY-MM-DD`, in ms: the chart's time-axis value. */
export const timelineT = utc
/** The `YYYY-MM-DD` of a time-axis value (UTC midnight). */
export const timelineDate = isoOf
export const TIMELINE_DAY_MS = DAY_MS

/** The calendar year a program year starting in July of that year begins. */
const programYearStart = (iso: string): number => {
  const [y, m] = iso.split('-').map(Number) as [number, number]
  return m >= 7 ? y : y - 1
}

/**
 * The date in the prior program year that is the same DAY OF THE PROGRAM
 * YEAR as `date` (July 1 is day 0). A leap day shifts the calendar date by
 * one, which is the point of aligning by program-year day.
 */
export function alignToPriorYear(
  date: string,
  priorProgramYear: string
): string {
  const day = (utc(date) - Date.UTC(programYearStart(date), 6, 1)) / DAY_MS
  const priorStart = Number(priorProgramYear.slice(0, 4))
  return isoOf(Date.UTC(priorStart, 6, 1) + day * DAY_MS)
}

/** The last day of a `YYYY-MM`. */
const monthEnd = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number) as [number, number]
  return isoOf(Date.UTC(y, m, 0))
}

/**
 * Last year's cumulative total at the same point in the program year as
 * `date`, or null when the prior year had nothing yet. Day grain: the last
 * observation on or before the aligned date. Month grain: the last
 * month-end on or before it.
 */
export function priorGhostAt(
  prior: NonNullable<TimelinePrior>,
  date: string
): number | null {
  const aligned = alignToPriorYear(date, prior.programYear)
  let value: number | null = null
  for (const g of prior.points) {
    const at = prior.grain === 'month' ? monthEnd(g.at) : g.at
    if (at > aligned) break
    value = g.total
  }
  return value
}

/**
 * How last year is drawn. More than one observation inside the prior program
 * year: the same-date curve. Otherwise (usually just the 06-30 close): one
 * flat target line at the latest prior total. Nothing prior: none.
 */
export function ghostPlan(prior: TimelinePrior): {
  kind: GhostKind
  target: { total: number; at: string } | null
} {
  if (!prior || prior.points.length === 0) return { kind: 'none', target: null }
  const start = Number(prior.programYear.slice(0, 4))
  const lo = isoOf(Date.UTC(start, 6, 1))
  const hi = isoOf(Date.UTC(start + 1, 5, 30))
  const inWindow = prior.points.filter(g => {
    const at = prior.grain === 'month' ? monthEnd(g.at) : g.at
    return at >= lo && at <= hi
  })
  if (inWindow.length > 1) return { kind: 'curve', target: null }
  const last = prior.points[prior.points.length - 1]!
  return { kind: 'target', target: { total: last.total, at: last.at } }
}

/**
 * A y-axis ceiling and ticks that read as round numbers: at least 8% above
 * `max`, 3 to 5 equal steps from zero, each step 1, 2, 2.5 or 5 times a power
 * of ten (whole numbers only: these are counts). The smallest such ceiling.
 */
export function niceScale(max: number): { max: number; ticks: number[] } {
  const need = Math.max(max, 1) * 1.08
  const exp = Math.floor(Math.log10(need))
  let best = { hi: Infinity, step: 1, n: 3 }
  for (let k = Math.max(0, exp - 2); k <= exp + 1; k++) {
    for (const m of [1, 2, 2.5, 5]) {
      const step = m * 10 ** k
      if (!Number.isInteger(step)) continue
      for (const n of [3, 4, 5]) {
        const hi = step * n
        if (hi >= need && hi < best.hi) best = { hi, step, n }
      }
    }
  }
  return {
    max: best.hi,
    ticks: Array.from({ length: best.n + 1 }, (_, i) => i * best.step),
  }
}

/* ── Bands ───────────────────────────────────────────────────────────── */

const levelBands = (points: readonly TimelineSourcePoint[]): TimelineBand[] => [
  ...LEVEL_KEYS.map((key, i) => ({
    key,
    label: `Level ${i + 1}`,
    colour: key.toLowerCase(),
  })),
  { key: 'DTM', label: 'DTM', colour: 'dtm' },
  ...(points.some(p => p.legacy > 0)
    ? [{ key: 'Legacy', label: 'Legacy', colour: 'legacy' }]
    : []),
  ...(points.some(p => p.other > 0)
    ? [{ key: 'Other', label: 'Other awards', colour: 'other' }]
    : []),
]

function levelValues(p: TimelineSourcePoint): Record<string, number> {
  return {
    L1: p.levels[0],
    L2: p.levels[1],
    L3: p.levels[2],
    L4: p.levels[3],
    L5: p.levels[4],
    DTM: p.dtm,
    Legacy: p.legacy,
    Other: p.other,
  }
}

/** The top paths by the series' final total, biggest first; ties by code. */
function topPaths(points: readonly TimelineSourcePoint[]): string[] {
  const last = points[points.length - 1]
  if (!last) return []
  return Object.entries(last.byPath)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_PATHS)
    .map(([code]) => code)
}

function pathValues(
  p: TimelineSourcePoint,
  top: readonly string[]
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const code of top) out[code] = p.byPath[code] ?? 0
  out[REST_KEY] = totalOf(p) - sum(Object.values(out))
  return out
}

/* ── Rows ────────────────────────────────────────────────────────────── */

export function deriveTimeline(args: {
  points: readonly TimelineSourcePoint[]
  mode: TimelineMode
  prior: TimelinePrior
  /** The page's selected date: later points are left out (R3). */
  through?: string | undefined
}): DerivedTimeline {
  const { mode, prior, through } = args
  const points = through
    ? args.points.filter(p => p.date <= through)
    : args.points

  let bands: TimelineBand[]
  let valuesOf: (p: TimelineSourcePoint) => Record<string, number>
  if (mode === 'level') {
    bands = levelBands(points)
    valuesOf = levelValues
  } else {
    const top = topPaths(points)
    const pathBands = top.map(code => ({
      key: code,
      label: pathTitle(code),
      colour: `p-${code.toLowerCase()}`,
    }))
    const hasRest = points.some(p => pathValues(p, top)[REST_KEY]! > 0)
    bands = [
      ...pathBands,
      ...(hasRest
        ? [{ key: REST_KEY, label: REST_LABEL, colour: REST_KEY }]
        : []),
    ]
    valuesOf = p => pathValues(p, top)
  }

  const plan = ghostPlan(prior)
  const ghostOf = (date: string): number | null =>
    plan.kind === 'curve' && prior
      ? priorGhostAt(prior, date)
      : plan.kind === 'target'
        ? plan.target!.total
        : null
  const rows = points.map(p => ({
    date: p.date,
    total: totalOf(p),
    ghost: ghostOf(p.date),
    values: valuesOf(p),
  }))
  return {
    bands,
    rows,
    ghostKind: plan.kind,
    target: plan.target,
  }
}
