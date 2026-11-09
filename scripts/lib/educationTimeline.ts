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
  educationTimelineEntityFile,
  educationTimelinePrefix,
  ledgerRecordsThroughMonth,
  type DistrictRegionHistory,
  type DistrictReportsDataset,
  type EducationAwardsBlock,
  type EducationLedgerHistoryFile,
  type EducationRollupIndex,
  type EducationRollupProgramYear,
  type EducationTimelineAggregatePoint,
  type EducationTimelineEntity,
  type EducationTimelineGhostPoint,
  type EducationTimelinePoint,
} from '@taverns-red/shared-contracts'
import { isDeepStrictEqual } from 'node:util'
import { rollUpEducationProgramYear } from './educationRollup.js'
import { programYearForSnapshotDate } from './ceoReportSnapshotDates.js'

/**
 * The previous year's cumulative totals, per entity. Published split into
 * each entity's own file (`prior` of the entity file).
 */
export interface GhostSet {
  programYear: string
  source: 'timeline' | 'ledger-history'
  grain: 'day' | 'month'
  world: EducationTimelineGhostPoint[]
  /** `null`: the prior PY had no region membership. */
  regions: Record<string, EducationTimelineGhostPoint[]> | null
  districts: Record<string, EducationTimelineGhostPoint[]>
}

/**
 * A program year's whole timeline, in memory: the working shape the fold
 * upserts into. It is never published as one object; `splitTimeline` turns it
 * into one file per entity and `joinTimeline` reads those files back.
 */
export interface EducationTimeline {
  programYear: string
  /** The newest date with a point: the last of `dates`. */
  asOf: string
  /** Every date with a world point, ascending. */
  dates: string[]
  world: EducationTimelineAggregatePoint[]
  regions: Record<string, EducationTimelineAggregatePoint[]> | null
  districts: Record<string, EducationTimelinePoint[]>
  prior: GhostSet | null
}

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
  prior: GhostSet | null
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
export function ghostFromTimeline(prior: EducationTimeline): GhostSet {
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

/** Ledger ghost points from one fold per month, ascending by `at`. */
function ghostFromMonthFolds(
  programYear: string,
  folds: readonly { at: string; rollup: EducationRollupProgramYear }[]
): GhostSet | null {
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
    source: 'ledger-history',
    grain: 'month',
    world,
    regions: regions && sortedRecord(regions),
    districts: sortedRecord(districts),
  }
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
): GhostSet | null {
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
  return ghostFromMonthFolds(programYear, folds)
}

export function timelineIndexRow(
  t: EducationTimeline
): NonNullable<EducationRollupIndex['timelines']>[number] {
  return {
    programYear: t.programYear,
    prefix: educationTimelinePrefix(t.programYear),
    asOf: t.asOf,
    dates: t.dates.length,
    priorGrain: t.prior?.grain ?? null,
  }
}

/** A program year's published files, keyed by file name inside its prefix. */
export type TimelineFiles = ReadonlyMap<string, EducationTimelineEntity>

function entityFile(
  programYear: string,
  kind: 'world' | 'region' | 'district',
  id: string | null,
  points: EducationTimelineEntity['points'],
  ghost: GhostSet | null,
  ghostPoints: EducationTimelineGhostPoint[] | undefined
): EducationTimelineEntity {
  return {
    _format: {
      version: EDUCATION_TIMELINE_VERSION,
      type: 'education-timeline-entity',
    },
    programYear,
    entity: { kind, id },
    asOf: points[points.length - 1]?.date,
    points,
    prior:
      ghost && ghostPoints && ghostPoints.length > 0
        ? {
            programYear: ghost.programYear,
            source: ghost.source,
            grain: ghost.grain,
            points: ghostPoints,
          }
        : null,
  } as EducationTimelineEntity
}

/** One file per entity: the world, each region, each district. */
export function splitTimeline(
  t: EducationTimeline
): Map<string, EducationTimelineEntity> {
  const out = new Map<string, EducationTimelineEntity>()
  const add = (e: EducationTimelineEntity): void => {
    out.set(
      educationTimelineEntityFile(e.entity.kind, e.entity.id as string | null),
      e
    )
  }
  const g = t.prior
  add(entityFile(t.programYear, 'world', null, t.world, g, g?.world))
  for (const [id, pts] of Object.entries(t.regions ?? {})) {
    add(entityFile(t.programYear, 'region', id, pts, g, g?.regions?.[id]))
  }
  for (const [id, pts] of Object.entries(t.districts)) {
    add(entityFile(t.programYear, 'district', id, pts, g, g?.districts[id]))
  }
  return out
}

/** The inverse of `splitTimeline`; null when there is no world file. */
export function joinTimeline(files: TimelineFiles): EducationTimeline | null {
  const world = files.get('world.json')
  if (!world || world.entity.kind !== 'world') return null
  const regionEntries: [string, EducationTimelineAggregatePoint[]][] = []
  const districts: Record<string, EducationTimelinePoint[]> = {}
  let ghost: GhostSet | null = null
  const ghostSeries = (
    e: EducationTimelineEntity
  ): EducationTimelineGhostPoint[] | null => {
    if (!e.prior) return null
    ghost ??= {
      programYear: e.prior.programYear,
      source: e.prior.source,
      grain: e.prior.grain,
      world: [],
      regions: null,
      districts: {},
    }
    return e.prior.points
  }
  const worldGhost = ghostSeries(world)
  const regionGhosts: Record<string, EducationTimelineGhostPoint[]> = {}
  const districtGhosts: Record<string, EducationTimelineGhostPoint[]> = {}
  for (const name of [...files.keys()].sort(byString)) {
    const e = files.get(name) as EducationTimelineEntity
    if (e.entity.kind === 'region') {
      regionEntries.push([
        e.entity.id,
        e.points as EducationTimelineAggregatePoint[],
      ])
      const gp = ghostSeries(e)
      if (gp) regionGhosts[e.entity.id] = gp
    } else if (e.entity.kind === 'district') {
      districts[e.entity.id] = e.points as EducationTimelinePoint[]
      const gp = ghostSeries(e)
      if (gp) districtGhosts[e.entity.id] = gp
    }
  }
  const worldPoints = world.points as EducationTimelineAggregatePoint[]
  const prior = ghost as GhostSet | null
  if (prior) {
    prior.world = worldGhost ?? []
    prior.regions = regionEntries.length > 0 ? regionGhosts : null
    prior.districts = districtGhosts
  }
  return {
    programYear: world.programYear,
    asOf: world.asOf,
    dates: worldPoints.map(p => p.date),
    world: worldPoints,
    regions:
      regionEntries.length > 0 ? Object.fromEntries(regionEntries) : null,
    districts,
    prior,
  }
}

export interface TimelineUpdatePlan {
  /** Per program year, ONLY the entity files whose data changed. */
  written: {
    programYear: string
    files: Map<string, EducationTimelineEntity>
  }[]
  /** Every timeline named in the index (changed or not). */
  rows: NonNullable<EducationRollupIndex['timelines']>
  skipped: { programYear: string; reason: string }[]
}

/**
 * The daily step (and the rollup rebuild): fold the CURRENT program year's
 * reports date into its per-entity files.
 *
 * - `existing`: the files the caller read, per program year. The current PY
 *   must be present (an empty map = its prefix was read and is empty, so seed
 *   it); a PY the caller did not consult is never seeded, because seeding
 *   over unread history would drop it. Other PYs may be present as a lone
 *   `world.json`, only to be named in the index.
 * - Only the current PY is ever written; older ones come from the backfill.
 * - Only files whose content changed are returned (the reporting districts,
 *   their regions, the world), so an unchanged entity is not rewritten.
 * - A new timeline takes its ghost from the previous year's files, if read.
 * - `blocked`: PYs whose stored files could not be read: left as they are
 *   and not named.
 */
export function planTimelineUpdates(
  rollups: readonly EducationRollupProgramYear[],
  existing: ReadonlyMap<string, TimelineFiles>,
  current: string,
  blocked: ReadonlySet<string> = new Set()
): TimelineUpdatePlan {
  const bundles = new Map<string, EducationTimeline>()
  for (const [py, files] of existing) {
    if (blocked.has(py)) continue
    const b = joinTimeline(files)
    if (b) bundles.set(py, b)
  }
  const written: TimelineUpdatePlan['written'] = []
  const skipped: TimelineUpdatePlan['skipped'] = []

  const rollup = rollups.find(
    r =>
      r.programYear === current &&
      r.source === 'reports' &&
      r.sourceDate !== null
  )
  if (rollup && !blocked.has(current)) {
    const stored = existing.get(current)
    if (!stored) {
      skipped.push({
        programYear: current,
        reason: `its stored files were not read, so it is not updated (seeding would drop history)`,
      })
    } else {
      try {
        let next = upsertTimelineDate(
          bundles.get(current) ?? null,
          current,
          rollup.sourceDate as string,
          rollup
        )
        if (next.prior === null) {
          const before = bundles.get(previousProgramYear(current))
          if (before) next = withPrior(next, ghostFromTimeline(before))
        }
        const changed = new Map<string, EducationTimelineEntity>()
        for (const [name, file] of splitTimeline(next)) {
          if (!isDeepStrictEqual(stored.get(name), file)) {
            changed.set(name, file)
          }
        }
        bundles.set(current, next)
        if (changed.size > 0)
          written.push({ programYear: current, files: changed })
      } catch (err) {
        skipped.push({ programYear: current, reason: (err as Error).message })
      }
    }
  }

  return {
    written,
    rows: [...bundles.values()]
      .sort((a, b) => byString(a.programYear, b.programYear))
      .map(timelineIndexRow),
    skipped,
  }
}

/** '2026-2027' → '2025-2026'. */
export function previousProgramYear(programYear: string): string {
  const y = Number(programYear.slice(0, 4))
  return `${y - 1}-${y}`
}
