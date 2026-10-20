/* Region and world meeting-time heatmaps (#1814, epic #1781) — pure layer.

   Reads `snapshots/{date}/meeting-times.json`: per district, the district
   page's own weekday × start-hour counts (#1796) in each mode, written by
   the pipeline from the clubs' parsed `meetingSchedule[]` (#1789). A region
   or world grid is the sum of its districts' grids. That is exact because a
   cell counts distinct clubs and each club is in one district.

   - Tolerant reader (#2183): unknown keys are ignored, and a district whose
     block is off-contract is left out and named (`unreadable`) rather than
     failing the page. A body that is not this artifact at all is `null`,
     meaning "not available yet", never a grid of zeros.
   - Hours are each club's local start time as listed. Nothing is
     converted between time zones (`timeBasis: 'local'`).
   - Scope and filter come from the page (URL-parsed there, R3) and are
     whitelisted against the file's own district and region set. */
import { MEETING_MODES, WEEKDAYS, eveningGapsOf } from './meetingHeatmap'
import type { MeetingMode, MeetingSlot } from './meetingHeatmap'
import type { MeetingWeekday } from '@taverns-red/shared-contracts'

/** The published file name (`MEETING_TIMES_FILE_NAME` in the pipeline). */
export const MEETING_TIMES_FILE = 'meeting-times.json'

export interface MeetingTimesGridView {
  /** [weekday 0 = Monday][hour 0–23] → distinct clubs. */
  counts: number[][]
  /** Per weekday: clubs with a meeting that day whose time is not stated. */
  noTime: number[]
  /** Scheduled clubs whose schedule states no mode (0 in `all`). */
  modeNotStated: number
}

export interface MeetingTimesDistrictView {
  id: string
  region: string | null
  clubs: number
  scheduled: number
  inPerson: number
  onlineCapable: number
  modes: Record<MeetingMode, MeetingTimesGridView>
}

export interface MeetingTimesView {
  snapshotDate: string
  programYear: string
  /** The file places districts in regions (a usable history). */
  hasRegions: boolean
  regionMembershipNote: string | null
  /** In id order: numeric ids ascending, then the rest. */
  districts: MeetingTimesDistrictView[]
  /** Districts whose block could not be read, left out of every sum. */
  unreadable: string[]
}

export type MeetingTimesScope =
  | { kind: 'region'; regionId: string; district?: string | null }
  | { kind: 'world'; region?: string | null }

export interface ScopedMeetingTimes {
  scope: MeetingTimesScope
  /** Every district of the scope (before the filter). */
  all: MeetingTimesDistrictView[]
  /** The districts the grid sums (after the filter). */
  districts: MeetingTimesDistrictView[]
  /** The filter's options: a region's districts, or the world's regions. */
  options: { id: string; label: string }[]
  /** The applied filter (whitelisted), or null = the whole scope. */
  filter: string | null
}

export interface MeetingTimesAggregate extends MeetingTimesGridView {
  clubs: number
  scheduled: number
  inPerson: number
  onlineCapable: number
  max: number
  eveningGaps: MeetingWeekday[]
}

export interface MeetingTimesChild {
  id: string
  label: string
  /** The child's own meetings page, or null (the undistricted bucket). */
  to: string | null
  clubs: number
  scheduled: number
  inPerson: number
  onlineCapable: number
  /** Clubs in the selected cell, or null with no cell selected. */
  inSlot: number | null
}

export const UNASSIGNED = 'unassigned'

const isCount = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0

const isRow = (v: unknown, n: number): v is number[] =>
  Array.isArray(v) && v.length === n && v.every(isCount)

const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null

function readGrid(v: unknown): MeetingTimesGridView | null {
  const g = asRecord(v)
  if (!g) return null
  const { counts, noTime, modeNotStated } = g
  if (!Array.isArray(counts) || counts.length !== 7) return null
  if (!counts.every(row => isRow(row, 24))) return null
  if (!isRow(noTime, 7) || !isCount(modeNotStated)) return null
  return {
    counts: counts as number[][],
    noTime,
    modeNotStated,
  }
}

function readDistrict(id: string, v: unknown): MeetingTimesDistrictView | null {
  const d = asRecord(v)
  const modes = asRecord(d?.['modes'])
  if (!d || !modes) return null
  const { region, clubs, scheduled, inPerson, onlineCapable } = d
  if (region !== null && typeof region !== 'string') return null
  if (
    !isCount(clubs) ||
    !isCount(scheduled) ||
    !isCount(inPerson) ||
    !isCount(onlineCapable)
  )
    return null
  const grids = {} as Record<MeetingMode, MeetingTimesGridView>
  for (const mode of MEETING_MODES) {
    const g = readGrid(modes[mode])
    if (!g) return null
    grids[mode] = g
  }
  return {
    id,
    region,
    clubs,
    scheduled,
    inPerson,
    onlineCapable,
    modes: grids,
  }
}

/** District ids in reading order: numeric ascending, then the rest. */
function byDistrictId(a: string, b: string): number {
  const na = /^\d+$/.test(a) ? Number(a) : Infinity
  const nb = /^\d+$/.test(b) ? Number(b) : Infinity
  if (na !== nb) return na < nb ? -1 : 1
  return a < b ? -1 : a > b ? 1 : 0
}

/** The artifact, tolerantly. Not this artifact at all → null. */
export function parseMeetingTimes(value: unknown): MeetingTimesView | null {
  const v = asRecord(value)
  const format = asRecord(v?.['_format'])
  const districts = asRecord(v?.['districts'])
  if (!v || !format || format['type'] !== 'meeting-times' || !districts)
    return null
  const { snapshotDate, programYear } = v
  if (typeof snapshotDate !== 'string' || typeof programYear !== 'string')
    return null
  const read: MeetingTimesDistrictView[] = []
  const unreadable: string[] = []
  for (const id of Object.keys(districts).sort(byDistrictId)) {
    const d = readDistrict(id, districts[id])
    if (d) read.push(d)
    else unreadable.push(id)
  }
  const note = v['regionMembershipNote']
  return {
    snapshotDate,
    programYear,
    hasRegions: asRecord(v['regionMembership']) !== null,
    regionMembershipNote: typeof note === 'string' ? note : null,
    districts: read,
    unreadable,
  }
}

const regionKey = (d: MeetingTimesDistrictView) => d.region ?? UNASSIGNED
const regionLabel = (key: string) =>
  key === UNASSIGNED ? 'Not in a region' : `Region ${key}`

/** The scope's districts, narrowed by its whitelisted filter. */
export function scopeMeetingTimes(
  view: MeetingTimesView,
  scope: MeetingTimesScope
): ScopedMeetingTimes {
  if (scope.kind === 'region') {
    const all = view.districts.filter(d => d.region === scope.regionId)
    const filter =
      scope.district && all.some(d => d.id === scope.district)
        ? scope.district
        : null
    return {
      scope,
      all,
      districts: filter ? all.filter(d => d.id === filter) : all,
      options: all.map(d => ({ id: d.id, label: `District ${d.id}` })),
      filter,
    }
  }
  const all = view.districts
  const regions = [...new Set(all.map(regionKey))].sort((a, b) =>
    a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a < b ? -1 : 1
  )
  const filter =
    scope.region && regions.includes(scope.region) ? scope.region : null
  return {
    scope,
    all,
    districts: filter ? all.filter(d => regionKey(d) === filter) : all,
    options: regions.map(r => ({ id: r, label: regionLabel(r) })),
    filter,
  }
}

const emptyGrid = (): MeetingTimesGridView => ({
  counts: WEEKDAYS.map(() => Array<number>(24).fill(0)),
  noTime: WEEKDAYS.map(() => 0),
  modeNotStated: 0,
})

/** Σ the districts' grids and KPIs for one mode. */
export function aggregateMeetingTimes(
  districts: readonly MeetingTimesDistrictView[],
  mode: MeetingMode
): MeetingTimesAggregate {
  const sum = emptyGrid()
  let clubs = 0
  let scheduled = 0
  let inPerson = 0
  let onlineCapable = 0
  for (const d of districts) {
    const g = d.modes[mode]
    for (let day = 0; day < 7; day++) {
      const row = sum.counts[day]!
      for (let h = 0; h < 24; h++) row[h] = row[h]! + g.counts[day]![h]!
      sum.noTime[day] = sum.noTime[day]! + g.noTime[day]!
    }
    sum.modeNotStated += g.modeNotStated
    clubs += d.clubs
    scheduled += d.scheduled
    inPerson += d.inPerson
    onlineCapable += d.onlineCapable
  }
  return {
    ...sum,
    clubs,
    scheduled,
    inPerson,
    onlineCapable,
    max: Math.max(0, ...sum.counts.flat()),
    eveningGaps: eveningGapsOf(sum.counts),
  }
}

const slotCount = (g: MeetingTimesGridView, slot: MeetingSlot) => {
  const d = WEEKDAYS.indexOf(slot.day)
  return slot.hour === null ? g.noTime[d]! : g.counts[d]![slot.hour]!
}

/** The page a child row links to, without its query (the view adds it). */
function childPath(scope: MeetingTimesScope, id: string): string | null {
  if (scope.kind === 'region') return `/district/${id}/meetings`
  return id === UNASSIGNED ? null : `/region/${id}/meetings`
}

/**
 * One level down: a region's districts, or the world's regions (the
 * undistricted bucket last, unlinked). With a cell selected each child
 * carries its count there and the busiest come first.
 */
export function meetingTimesChildren(
  scoped: ScopedMeetingTimes,
  mode: MeetingMode,
  slot: MeetingSlot | null
): MeetingTimesChild[] {
  const groups = new Map<string, MeetingTimesDistrictView[]>()
  for (const d of scoped.districts) {
    const key = scoped.scope.kind === 'region' ? d.id : regionKey(d)
    groups.set(key, [...(groups.get(key) ?? []), d])
  }
  const rows: MeetingTimesChild[] = []
  for (const opt of scoped.options) {
    const members = groups.get(opt.id)
    if (!members) continue
    const a = aggregateMeetingTimes(members, mode)
    rows.push({
      id: opt.id,
      label: opt.label,
      to: childPath(scoped.scope, opt.id),
      clubs: a.clubs,
      scheduled: a.scheduled,
      inPerson: a.inPerson,
      onlineCapable: a.onlineCapable,
      inSlot: slot ? slotCount(a, slot) : null,
    })
  }
  if (slot) rows.sort((a, b) => (b.inSlot ?? 0) - (a.inSlot ?? 0))
  return rows
}
