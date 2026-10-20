/**
 * Meeting-time heatmap (#1796, epic #1781) — pure layer, no React.
 *
 * Reads the parsed `meetingSchedule[]` that #1789 publishes on every club
 * (FAC MeetingDay / MeetingTime / Location). Rules:
 *
 *  - A cell is (weekday, start hour). Its value is the number of DISTINCT
 *    clubs with a meeting that starts in that hour, so a club meeting in
 *    person on the 1st and online on the 2nd Wednesday at 19:30 counts once.
 *  - Mode: "in-person" is an in-person or hybrid meeting, "online" is an
 *    online or hybrid meeting; "all" is any meeting, mode stated or not.
 *  - Nothing is dropped. A club with no parsed schedule is `unknown`; a
 *    meeting with a weekday but no time is "time not stated" on that day;
 *    in a mode view, a club whose schedule never states a mode is
 *    `modeNotStated`, not a silent zero.
 *
 * The map's `?meets=` filter uses the same predicate (`matchesMeetingFilter`),
 * so "Show on the map" lands on exactly the clubs the cell lists.
 *
 * Privacy: only the parsed fields are read. Never the free-text day, time or
 * location, never a link, email or phone.
 */
import type {
  MeetingScheduleEntry,
  MeetingWeekday,
} from '@taverns-red/shared-contracts'

export const WEEKDAYS: readonly MeetingWeekday[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export type MeetingMode = 'all' | 'in-person' | 'online'
export const MEETING_MODES: readonly MeetingMode[] = [
  'all',
  'in-person',
  'online',
]

export const MEETING_MODE_LABELS: Record<MeetingMode, string> = {
  all: 'All meetings',
  'in-person': 'In person',
  online: 'Online',
}

/** The fields the heatmap reads from a ClubTrend. */
export interface MeetingClub {
  clubId: string
  clubName: string
  divisionId?: string
  divisionName?: string
  areaId?: string
  areaName?: string
  meetingSchedule?: MeetingScheduleEntry[] | null
}

/** A cell: weekday and start hour (0–23), or `null` = time not stated. */
export interface MeetingSlot {
  day: MeetingWeekday
  hour: number | null
}

/** A selection: a cell, the unknown-schedule list, or the no-mode list. */
export type MeetingSelection = MeetingSlot | 'unknown' | 'nomode'

export interface MeetingHeatmap {
  /** [weekday 0 = Monday][hour 0–23] → distinct clubs. */
  counts: number[][]
  /** Per weekday: clubs with a meeting that day whose time is not stated. */
  noTime: number[]
  /** The busiest cell (0 when no club has a parsed time). */
  max: number
  totalClubs: number
  /** Clubs with at least one parsed meeting. */
  scheduled: number
  /** Clubs with no parsed schedule. */
  unknown: MeetingClub[]
  /** Mode views only: scheduled clubs whose schedule states no mode at all. */
  modeNotStated: MeetingClub[]
  /** Clubs with an online or hybrid meeting. */
  onlineCapable: number
  /** Clubs with an in-person or hybrid meeting. */
  inPerson: number
  /** Weekdays where no club (in this mode) starts 17:00–21:59. */
  eveningGaps: MeetingWeekday[]
}

export const EVENING_START_HOUR = 17
export const EVENING_END_HOUR = 22

export function parseMeetingMode(raw: string | null): MeetingMode {
  return raw === 'in-person' || raw === 'online' ? raw : 'all'
}

function entryMatchesMode(e: MeetingScheduleEntry, mode: MeetingMode) {
  if (mode === 'all') return true
  if (mode === 'online') return e.mode === 'online' || e.mode === 'hybrid'
  return e.mode === 'in-person' || e.mode === 'hybrid'
}

/** Start hour of an entry, or null when the time is not stated. */
export function entryHour(e: MeetingScheduleEntry): number | null {
  const m = /^(\d{2}):\d{2}$/.exec(e.startTime ?? '')
  return m ? Number(m[1]) : null
}

const schedule = (c: MeetingClub): MeetingScheduleEntry[] =>
  Array.isArray(c.meetingSchedule) ? c.meetingSchedule : []

const entryInSlot = (
  e: MeetingScheduleEntry,
  slot: MeetingSlot,
  mode: MeetingMode
) =>
  e.day === slot.day && entryHour(e) === slot.hour && entryMatchesMode(e, mode)

/** Weekdays where no club starts 17:00–21:59 in a [day][hour] grid. */
export function eveningGapsOf(
  counts: readonly (readonly number[])[]
): MeetingWeekday[] {
  return WEEKDAYS.filter((_, d) =>
    counts[d]!.slice(EVENING_START_HOUR, EVENING_END_HOUR).every(n => n === 0)
  )
}

export function buildMeetingHeatmap(
  clubs: readonly MeetingClub[],
  mode: MeetingMode
): MeetingHeatmap {
  const cells = WEEKDAYS.map(() =>
    Array.from({ length: 24 }, () => new Set<string>())
  )
  const noTime = WEEKDAYS.map(() => new Set<string>())
  const unknown: MeetingClub[] = []
  const modeNotStated: MeetingClub[] = []
  let scheduled = 0
  let onlineCapable = 0
  let inPerson = 0

  for (const club of clubs) {
    const entries = schedule(club)
    if (entries.length === 0) {
      unknown.push(club)
      continue
    }
    scheduled++
    if (entries.some(e => entryMatchesMode(e, 'online'))) onlineCapable++
    if (entries.some(e => entryMatchesMode(e, 'in-person'))) inPerson++
    if (mode !== 'all' && entries.every(e => e.mode === undefined))
      modeNotStated.push(club)
    for (const e of entries) {
      if (!entryMatchesMode(e, mode)) continue
      const d = WEEKDAYS.indexOf(e.day)
      if (d < 0) continue
      const h = entryHour(e)
      if (h === null) noTime[d]!.add(club.clubId)
      else cells[d]![h]!.add(club.clubId)
    }
  }

  const counts = cells.map(row => row.map(s => s.size))
  const max = Math.max(0, ...counts.flat())
  const eveningGaps = eveningGapsOf(counts)
  return {
    counts,
    noTime: noTime.map(s => s.size),
    max,
    totalClubs: clubs.length,
    scheduled,
    unknown,
    modeNotStated,
    onlineCapable,
    inPerson,
    eveningGaps,
  }
}

/** Shade step of a cell: 0 = empty, 1–4 = quartile of the busiest cell. */
export function intensityLevel(count: number, max: number): number {
  if (count <= 0 || max <= 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((count / max) * 4)))
}

const byName = (a: MeetingClub, b: MeetingClub) =>
  a.clubName.localeCompare(b.clubName, undefined, { sensitivity: 'base' })

/** The clubs a cell counts, by name. */
export function clubsInSlot<C extends MeetingClub>(
  clubs: readonly C[],
  slot: MeetingSlot,
  mode: MeetingMode
): C[] {
  return clubs
    .filter(c => schedule(c).some(e => entryInSlot(e, slot, mode)))
    .sort(byName)
}

/** The clubs a selection lists. */
export function clubsForSelection<C extends MeetingClub>(
  clubs: readonly C[],
  selection: MeetingSelection,
  mode: MeetingMode
): C[] {
  if (selection === 'unknown')
    return clubs.filter(c => schedule(c).length === 0).sort(byName)
  if (selection === 'nomode')
    return mode === 'all'
      ? []
      : clubs
          .filter(
            c =>
              schedule(c).length > 0 &&
              schedule(c).every(e => e.mode === undefined)
          )
          .sort(byName)
  return clubsInSlot(clubs, selection, mode)
}

/** The entries of a club that put it in a slot (for the list's detail). */
export function entriesInSlot(
  club: MeetingClub,
  slot: MeetingSlot,
  mode: MeetingMode
): MeetingScheduleEntry[] {
  return schedule(club).filter(e => entryInSlot(e, slot, mode))
}

const pad = (h: number) => String(h).padStart(2, '0')

/** `?slot=` value: `tue-19`, `tue-notime`. */
export function slotKey(slot: MeetingSlot): string {
  const day = DAY_KEYS[WEEKDAYS.indexOf(slot.day)]!
  return `${day}-${slot.hour === null ? 'notime' : pad(slot.hour)}`
}

function parseDayHour(day: string, hour: string): MeetingSlot | null {
  const d = (DAY_KEYS as readonly string[]).indexOf(day)
  if (d < 0) return null
  if (hour === 'notime') return { day: WEEKDAYS[d]!, hour: null }
  if (!/^\d{2}$/.test(hour) || Number(hour) > 23) return null
  return { day: WEEKDAYS[d]!, hour: Number(hour) }
}

/** `?slot=` is URL-seedable: whitelisted here, garbage → null. */
export function parseMeetingSlot(raw: string | null): MeetingSelection | null {
  if (raw === 'unknown' || raw === 'nomode') return raw
  const m = /^([a-z]{3})-([a-z0-9]+)$/.exec(raw ?? '')
  return m ? parseDayHour(m[1]!, m[2]!) : null
}

const MODE_SUFFIX: Record<Exclude<MeetingMode, 'all'>, string> = {
  'in-person': 'inperson',
  online: 'online',
}

/** The map's `?meets=` value for a cell in a mode: `tue-19-online`. */
export function meetingFilterToken(
  slot: MeetingSlot,
  mode: MeetingMode
): string {
  return mode === 'all'
    ? slotKey(slot)
    : `${slotKey(slot)}-${MODE_SUFFIX[mode]}`
}

interface MeetingFilter {
  day: MeetingWeekday
  /** undefined = any time that day. */
  hour?: number | null
  mode: MeetingMode
}

function parseMeetingFilter(token: string): MeetingFilter | null {
  const m = /^([a-z]{3})(?:-([a-z0-9]+))?(?:-(online|inperson))?$/.exec(token)
  if (!m) return null
  const mode: MeetingMode =
    m[3] === 'online' ? 'online' : m[3] === 'inperson' ? 'in-person' : 'all'
  if (m[2] === undefined) {
    const d = (DAY_KEYS as readonly string[]).indexOf(m[1]!)
    return d < 0 ? null : { day: WEEKDAYS[d]!, mode }
  }
  const slot = parseDayHour(m[1]!, m[2])
  return slot ? { ...slot, mode } : null
}

/** Does a club match a map `?meets=` token? Garbage matches nothing. */
export function matchesMeetingFilter(
  club: MeetingClub,
  token: string
): boolean {
  const f = parseMeetingFilter(token)
  if (!f) return false
  return schedule(club).some(
    e =>
      e.day === f.day &&
      (f.hour === undefined || entryHour(e) === f.hour) &&
      entryMatchesMode(e, f.mode)
  )
}

/** Human label for a `?meets=` token ("Tuesday 19:00–19:59 · Online"). */
export function describeMeetingFilter(token: string): string | null {
  const f = parseMeetingFilter(token)
  if (!f) return null
  const time =
    f.hour === undefined
      ? ''
      : f.hour === null
        ? ', time not stated'
        : ` ${hourRangeLabel(f.hour)}`
  const mode = f.mode === 'all' ? '' : ` · ${MEETING_MODE_LABELS[f.mode]}`
  return `${f.day}${time}${mode}`
}

/** "19:00–19:59". */
export function hourRangeLabel(hour: number): string {
  return `${pad(hour)}:00–${pad(hour)}:59`
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th']

const MODE_TEXT: Record<NonNullable<MeetingScheduleEntry['mode']>, string> = {
  'in-person': 'In person',
  online: 'Online',
  hybrid: 'Hybrid',
}

/** "Wednesday 19:30 · 1st & 3rd of the month · In person". */
export function describeMeetingEntry(e: MeetingScheduleEntry): string {
  const time = e.startTime
    ? ` ${e.startTime}${e.endTime ? `–${e.endTime}` : ''}`
    : ', time not stated'
  const parts = [`${e.day}${time}`]
  if (e.cadence === 'weekly') parts.push('Weekly')
  else if (e.cadence === 'biweekly') parts.push('Every other week')
  else if (e.cadence === 'monthly')
    parts.push(
      e.weeksOfMonth?.length
        ? `${e.weeksOfMonth.map(w => ORDINALS[w - 1] ?? `${w}th`).join(' & ')} of the month`
        : 'Monthly'
    )
  if (e.mode) parts.push(MODE_TEXT[e.mode])
  return parts.join(' · ')
}
