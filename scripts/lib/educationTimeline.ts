/**
 * Education timeline fold (#2591, epic #2590).
 *
 * Turns the education rollup's per-date folds into the cumulative series the
 * Education page chart steps through (`derived/education-timeline/<PY>.json`,
 * contract: shared-contracts education-timeline.schema). It does not count
 * awards itself: every point is read off a `rollUpEducationProgramYear`
 * result for that date (the same fold that feeds the KPI tiles), so the
 * chart's last point equals the tiles by construction, and a district that
 * the rollup calls not-available has no point (absent, never zero).
 *
 * Incremental: `upsertTimelineDate` adds or replaces ONE date in an existing
 * timeline. The daily run folds only the day it just rolled up; the backfill
 * folds a date at a time. Neither scans a program year's history.
 *
 * Lesson 153: counts only. Nothing here reads a club, member or name.
 */

import {
  EDUCATION_TIMELINE_VERSION,
  educationTimelineObjectPath,
  ledgerRecordsThroughMonth,
  type DistrictRegionHistory,
  type DistrictReportsDataset,
  type EducationAwardsBlock,
  type EducationLedgerHistoryFile,
  type EducationRollupIndex,
  type EducationRollupProgramYear,
  type EducationTimeline,
  type EducationTimelineAggregatePoint,
  type EducationTimelineGhostPoint,
  type EducationTimelinePoint,
  type EducationTimelinePrior,
} from '@taverns-red/shared-contracts'
import { rollUpEducationProgramYear } from './educationRollup.js'
import { programYearForSnapshotDate } from './ceoReportSnapshotDates.js'

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

function sortedRecord<T>(rec: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {}
  for (const k of Object.keys(rec).sort(byString)) out[k] = rec[k] as T
  return out
}

/** Fold one date's reports exactly as the rollup does (no district list). */
export function foldReportsDate(args: {
  programYear: string
  date: string
  reports: readonly DistrictReportsDataset[]
  regionHistory: DistrictRegionHistory | null
}): EducationRollupProgramYear {
  return rollUpEducationProgramYear({
    programYear: args.programYear,
    source: 'reports',
    sourceDate: args.date,
    ledgerFiles: [],
    reports: args.reports,
    districtIds: [],
    regionHistory: args.regionHistory,
  })
}

/** One rollup block, reduced to what the chart stacks. */
function pointOf(
  date: string,
  block: EducationAwardsBlock
): EducationTimelinePoint {
  const levels: [number, number, number, number, number] = [0, 0, 0, 0, 0]
  const byPath: Record<string, number> = {}
  for (const [path, cells] of Object.entries(block.pathwaysMatrix)) {
    let n = 0
    cells.forEach((c, i) => {
      levels[i] = (levels[i] as number) + c
      n += c
    })
    if (n > 0) byPath[path] = n
  }
  return {
    date,
    levels,
    dtm: block.totals.dtm,
    legacy: block.totals.legacy,
    other: block.totals.other,
    byPath: sortedRecord(byPath),
  }
}

const awardsOf = (p: EducationTimelinePoint): number =>
  p.levels.reduce((a, b) => a + b, 0) + p.dtm + p.legacy + p.other

type Series<P extends { date: string }> = Record<string, P[]>

/** `series` without `date`, then with `add` (kept ascending). */
function replaceDate<P extends { date: string }>(
  series: Series<P>,
  date: string,
  add: Record<string, P>
): Series<P> {
  const out: Series<P> = {}
  const keys = new Set([...Object.keys(series), ...Object.keys(add)])
  for (const k of keys) {
    const kept = (series[k] ?? []).filter(p => p.date !== date)
    const added = add[k]
    const next = added ? [...kept, added] : kept
    if (next.length > 0) out[k] = next.sort((a, b) => byString(a.date, b.date))
  }
  return sortedRecord(out)
}

/**
 * Add or replace `date` in `existing` from that date's rollup. Pure: the
 * series of every other date are untouched. A district (or region) absent
 * from the rollup that date has no point that date, even if an earlier fold
 * of the same date had one. Keeps the existing prior-year ghost.
 */
export function upsertTimelineDate(
  existing: EducationTimeline | null,
  programYear: string,
  date: string,
  rollup: EducationRollupProgramYear
): EducationTimeline {
  if (programYearForSnapshotDate(date) !== programYear) {
    throw new Error(
      `${date} is not in program year ${programYear}; a timeline holds one program year`
    )
  }
  if (existing && existing.programYear !== programYear) {
    throw new Error(
      `existing timeline is ${existing.programYear}, not ${programYear}`
    )
  }

  const districts: Record<string, EducationTimelinePoint> = {}
  for (const [id, d] of Object.entries(rollup.districts)) {
    if (d.status === 'available') districts[id] = pointOf(date, d.awards)
  }
  const aggregate = (
    a: EducationRollupProgramYear['world']
  ): EducationTimelineAggregatePoint | null =>
    a.districtsAvailable.length === 0
      ? null
      : { ...pointOf(date, a), districts: a.districtsAvailable.length }
  const regionAdd: Record<string, EducationTimelineAggregatePoint> = {}
  for (const [region, agg] of Object.entries(rollup.regions ?? {})) {
    const p = aggregate(agg)
    if (p) regionAdd[region] = p
  }
  const worldPoint = aggregate(rollup.world)

  const world = (existing?.world ?? []).filter(p => p.date !== date)
  if (worldPoint) world.push(worldPoint)
  world.sort((a, b) => byString(a.date, b.date))

  const regionsOut =
    rollup.regions === null && existing?.regions == null
      ? null
      : replaceDate(existing?.regions ?? {}, date, regionAdd)
  const districtsOut = replaceDate(existing?.districts ?? {}, date, districts)

  const dates = [...new Set(world.map(p => p.date))].sort(byString)
  if (dates.length === 0) {
    throw new Error(`no district has education awards on ${date}`)
  }
  return {
    _format: {
      version: EDUCATION_TIMELINE_VERSION,
      type: 'education-timeline',
    },
    programYear,
    asOf: dates[dates.length - 1] as string,
    dates,
    world,
    regions: regionsOut,
    districts: districtsOut,
    prior: existing?.prior ?? null,
  }
}

export function withPrior(
  t: EducationTimeline,
  prior: EducationTimelinePrior | null
): EducationTimeline {
  return { ...t, prior }
}

type GhostSeries = Record<string, EducationTimelineGhostPoint[]>

function pushGhost(
  into: GhostSeries,
  key: string,
  at: string,
  total: number
): void {
  ;(into[key] ??= []).push({ at, total })
}

/** The previous year's ghost, read from that year's own timeline. */
export function ghostFromTimeline(
  prior: EducationTimeline
): EducationTimelinePrior {
  const world: EducationTimelineGhostPoint[] = prior.world.map(p => ({
    at: p.date,
    total: awardsOf(p),
  }))
  const regions: GhostSeries | null = prior.regions === null ? null : {}
  for (const [k, ps] of Object.entries(prior.regions ?? {})) {
    for (const p of ps)
      pushGhost(regions as GhostSeries, k, p.date, awardsOf(p))
  }
  const districts: GhostSeries = {}
  for (const [k, ps] of Object.entries(prior.districts)) {
    for (const p of ps) pushGhost(districts, k, p.date, awardsOf(p))
  }
  return {
    programYear: prior.programYear,
    source: 'timeline',
    grain: 'day',
    world,
    regions: regions && sortedRecord(regions),
    districts: sortedRecord(districts),
  }
}

/** Ghost points from a list of (key → total) folds, ascending by `at`. */
function ghostFromFolds(
  programYear: string,
  source: EducationTimelinePrior['source'],
  grain: EducationTimelinePrior['grain'],
  folds: readonly { at: string; rollup: EducationRollupProgramYear }[]
): EducationTimelinePrior | null {
  const world: EducationTimelineGhostPoint[] = []
  let regions: GhostSeries | null = null
  const districts: GhostSeries = {}
  for (const { at, rollup } of [...folds].sort((a, b) =>
    byString(a.at, b.at)
  )) {
    if (rollup.world.districtsAvailable.length > 0) {
      world.push({ at, total: rollup.world.totals.awards })
    }
    if (rollup.regions !== null) {
      regions ??= {}
      for (const [k, agg] of Object.entries(rollup.regions)) {
        if (agg.districtsAvailable.length > 0) {
          pushGhost(regions, k, at, agg.totals.awards)
        }
      }
    }
    for (const [id, d] of Object.entries(rollup.districts)) {
      if (d.status === 'available') {
        pushGhost(districts, id, at, d.awards.totals.awards)
      }
    }
  }
  if (world.length === 0) return null
  return {
    programYear,
    source,
    grain,
    world,
    regions: regions && sortedRecord(regions),
    districts: sortedRecord(districts),
  }
}

/** The previous year's ghost from its per-date reports folds (day grain). */
export function ghostFromRollups(
  programYear: string,
  entries: readonly { date: string; rollup: EducationRollupProgramYear }[]
): EducationTimelinePrior | null {
  return ghostFromFolds(
    programYear,
    'reports',
    'day',
    entries.map(e => ({ at: e.date, rollup: e.rollup }))
  )
}

/** The program year's twelve months, July first, as YYYY-MM. */
function monthsOf(programYear: string): string[] {
  const y = Number(programYear.slice(0, 4))
  const m = (year: number, mo: number): string =>
    `${year}-${String(mo).padStart(2, '0')}`
  return [
    ...[7, 8, 9, 10, 11, 12].map(mo => m(y, mo)),
    ...[1, 2, 3, 4, 5, 6].map(mo => m(y + 1, mo)),
  ]
}

/**
 * The previous year's ghost from the education ledger history (staging
 * only): the month-end cumulative at each of the PY's twelve months. Month
 * grain, because the ledger's dates are month precision; the grain is
 * written into the data so the chart can say so.
 */
export function ghostFromLedger(
  programYear: string,
  files: readonly EducationLedgerHistoryFile[],
  regionHistory: DistrictRegionHistory | null
): EducationTimelinePrior | null {
  const folds = monthsOf(programYear).map(month => ({
    at: month,
    rollup: rollUpEducationProgramYear({
      programYear,
      source: 'ledger-history',
      sourceDate: null,
      ledgerFiles: files.map(f => ({
        ...f,
        records: ledgerRecordsThroughMonth(f.records, month),
      })),
      reports: [],
      districtIds: [],
      regionHistory,
    }),
  }))
  return ghostFromFolds(programYear, 'ledger-history', 'month', folds)
}

export function timelineIndexRow(
  t: EducationTimeline
): NonNullable<EducationRollupIndex['timelines']>[number] {
  return {
    programYear: t.programYear,
    path: educationTimelineObjectPath(t.programYear),
    asOf: t.asOf,
    dates: t.dates.length,
    priorGrain: t.prior?.grain ?? null,
  }
}

export interface TimelineUpdatePlan {
  written: EducationTimeline[]
  rows: NonNullable<EducationRollupIndex['timelines']>
  skipped: { programYear: string; reason: string }[]
}

/** Stub (red): lands in the next commit (#2591). */
export function planTimelineUpdates(
  _rollups: readonly EducationRollupProgramYear[],
  _existing: ReadonlyMap<string, EducationTimeline>
): TimelineUpdatePlan {
  throw new Error('not implemented')
}
