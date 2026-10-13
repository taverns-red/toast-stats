/**
 * Data builder for MembershipTrendChart (#1705).
 *
 * Spec (Ron): the chart shows the whole program year. While the current year
 * is in progress it runs up to its latest date, plotted against the full
 * year of each prior year. Every series is placed by its position in the
 * program year (`calculateProgramYearDay`, the same x the payments chart
 * uses), so 30 Sep plots at the same x for every year whatever each year's
 * point density (month-ends early in a prior PY, dailies later).
 *
 * D15 (Ron, 2026-10-09): TI's rollover lag means the current PY's first
 * point lands around 07-26 (#1284). The current line is anchored at day 0 on
 * the predecessor PY's 06-30 close rather than leaving July 1–25 empty. The
 * anchor is a plotted point only; statistics use the current year's own
 * points (`series.points.filter(p => !p.anchor)`).
 */
import { calculateProgramYearDay } from '../utils/programYear'

export interface TrendPoint {
  date: string
  count: number
}

export interface PriorYearTrend {
  label: string
  data: TrendPoint[]
}

export interface TrendSeriesPoint extends TrendPoint {
  /** Day of the program year, 0 = July 1. */
  day: number
  /** True for the D15 anchor: the predecessor PY's 06-30 close at day 0. */
  anchor?: boolean
}

export interface TrendSeries {
  /** Row key in `rows` for this series. */
  key: string
  /** Program year label, e.g. "2026-2027". */
  label: string
  isCurrent: boolean
  /** Current series whose latest point is before its PY's 30 June. */
  inProgress: boolean
  points: TrendSeriesPoint[]
}

export interface TrendChartRow {
  day: number
  [seriesKey: string]: number | undefined
}

export interface MembershipTrendChartData {
  /** One row per program-year day that any series has a point on. */
  rows: TrendChartRow[]
  /** The current series first, then prior years in the order given. */
  series: TrendSeries[]
  /** [0, last plotted day across every series]. */
  domain: [number, number]
}

export const CURRENT_SERIES_KEY = 'current'

const byDate = (a: TrendPoint, b: TrendPoint) => a.date.localeCompare(b.date)

/** Last element (the frontend's lib target predates Array.prototype.at). */
export const lastOf = <T>(xs: readonly T[]): T | undefined => xs[xs.length - 1]

const toSeriesPoints = (data: TrendPoint[]): TrendSeriesPoint[] =>
  [...data].sort(byDate).map(p => ({
    date: p.date,
    count: p.count,
    day: calculateProgramYearDay(p.date),
  }))

/** "2026-2027" → "2025-2026"; undefined for anything else. */
function predecessorLabel(programYear: string | undefined): string | undefined {
  const m = programYear ? /^(\d{4})-(\d{4})$/.exec(programYear) : null
  if (!m) return undefined
  const start = Number(m[1])
  return `${start - 1}-${start}`
}

/** "2026-2027" → "2027-06-30". */
function programYearEndDate(programYear: string | undefined): string | null {
  const m = programYear ? /^\d{4}-(\d{4})$/.exec(programYear) : null
  return m ? `${m[1]}-06-30` : null
}

export function buildMembershipTrendChartData(
  current: TrendPoint[],
  priors: PriorYearTrend[],
  currentProgramYear?: string
): MembershipTrendChartData {
  const currentPoints = toSeriesPoints(current)

  // D15 anchor: only on the immediate predecessor's 06-30 close, and only
  // when the current year has not already got a July 1 point of its own.
  const predecessor = predecessorLabel(currentProgramYear)
  const predecessorTrend = priors.find(p => p.label === predecessor)
  const predecessorClose = predecessorTrend
    ? lastOf([...predecessorTrend.data].sort(byDate))
    : undefined
  const predecessorEnd = programYearEndDate(predecessor)
  if (
    predecessorClose &&
    predecessorClose.date === predecessorEnd &&
    currentPoints.length > 0 &&
    currentPoints[0]!.day > 0
  ) {
    currentPoints.unshift({
      date: predecessorClose.date,
      count: predecessorClose.count,
      day: 0,
      anchor: true,
    })
  }

  const lastCurrent = lastOf(currentPoints)
  const end = programYearEndDate(currentProgramYear)
  const series: TrendSeries[] = [
    {
      key: CURRENT_SERIES_KEY,
      label: currentProgramYear ?? 'Current year',
      isCurrent: true,
      inProgress: !!lastCurrent && !!end && lastCurrent.date < end,
      points: currentPoints,
    },
    ...priors.map((p, i) => ({
      key: `prior_${i}`,
      label: p.label,
      isCurrent: false,
      inProgress: false,
      points: toSeriesPoints(p.data),
    })),
  ]

  const rowsByDay = new Map<number, TrendChartRow>()
  for (const s of series) {
    for (const p of s.points) {
      const row = rowsByDay.get(p.day) ?? { day: p.day }
      // Same-day duplicates within a series: the later date wins.
      row[s.key] = p.count
      rowsByDay.set(p.day, row)
    }
  }
  const rows = [...rowsByDay.values()].sort((a, b) => a.day - b.day)
  const lastDay = rows.length > 0 ? rows[rows.length - 1]!.day : 0

  return { rows, series, domain: [0, lastDay] }
}

/**
 * The point of `series` that a hover at program-year `day` reads: the
 * nearest point no further than `maxGap` days away, and never past the
 * series' last point (an in-progress year has no value after today).
 */
export function pointNearDay(
  series: TrendSeries,
  day: number,
  maxGap = 16
): TrendSeriesPoint | undefined {
  const last = lastOf(series.points)
  if (!last || day > last.day + 0.5) return undefined
  let best: TrendSeriesPoint | undefined
  for (const p of series.points) {
    if (!best || Math.abs(p.day - day) < Math.abs(best.day - day)) best = p
  }
  return best && Math.abs(best.day - day) <= maxGap ? best : undefined
}
