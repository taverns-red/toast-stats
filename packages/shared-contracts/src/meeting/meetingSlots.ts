/**
 * The meeting-time counting rule (#1796, #1814) — one definition for the
 * district heatmap and the pipeline's `snapshots/{date}/meeting-times.json`,
 * so a region's grid is exactly the sum of its districts' pages.
 *
 *  - A cell is (weekday, start hour). Its value is the number of DISTINCT
 *    clubs with a meeting that starts in that hour, so a club meeting in
 *    person on the 1st and online on the 2nd Wednesday at 19:30 counts once.
 *  - Mode: `in-person` is an in-person or hybrid meeting, `online` is an
 *    online or hybrid meeting; `all` is any meeting, mode stated or not.
 *  - Nothing is dropped. A club with no parsed schedule is `clubs −
 *    scheduled`; a meeting with a weekday but no well-formed `HH:MM` start
 *    is "time not stated" on that day; in a mode view, a club whose schedule
 *    never states a mode is `modeNotStated`.
 *  - Start hours are the club's local time as listed; never converted.
 *
 * Reads only the parsed fields: never free text, a link or a place.
 *
 * @module meeting/meetingSlots
 */
import type { MeetingScheduleEntry } from '../types/district-statistics-file.js'
import type { MeetingTimesMode } from '../schemas/meeting-times.schema.js'
import { MEETING_WEEKDAYS } from '../schemas/district-statistics-file.schema.js'

/** The fields the rule reads from a club. */
export interface MeetingSlotClub {
  readonly clubId: string
  readonly meetingSchedule?: readonly MeetingScheduleEntry[] | null
}

export interface MeetingSlotCounts {
  /** [weekday 0 = Monday][hour 0–23] → distinct clubs. */
  counts: number[][]
  /** Per weekday: clubs with a meeting that day whose time is not stated. */
  noTime: number[]
  clubs: number
  /** Clubs with at least one parsed meeting. */
  scheduled: number
  /** Mode views only: scheduled clubs whose schedule states no mode. */
  modeNotStated: number
  /** Clubs with an in-person or hybrid meeting. */
  inPerson: number
  /** Clubs with an online or hybrid meeting. */
  onlineCapable: number
}

/** Does a meeting belong to a mode view? */
export function meetingEntryMatchesMode(
  e: Pick<MeetingScheduleEntry, 'mode'>,
  mode: MeetingTimesMode
): boolean {
  if (mode === 'all') return true
  if (mode === 'online') return e.mode === 'online' || e.mode === 'hybrid'
  return e.mode === 'in-person' || e.mode === 'hybrid'
}

/** Start hour of a meeting (0–23), or null when the time is not stated. */
export function meetingEntryHour(
  e: Pick<MeetingScheduleEntry, 'startTime'>
): number | null {
  const m = /^(\d{2}):\d{2}$/.exec(e.startTime ?? '')
  return m ? Number(m[1]) : null
}

export function countMeetingSlots(
  clubs: readonly MeetingSlotClub[],
  mode: MeetingTimesMode
): MeetingSlotCounts {
  const days: readonly string[] = MEETING_WEEKDAYS
  const cells = days.map(() =>
    Array.from({ length: 24 }, () => new Set<string>())
  )
  const noTime = days.map(() => new Set<string>())
  let scheduled = 0
  let modeNotStated = 0
  let inPerson = 0
  let onlineCapable = 0

  for (const club of clubs) {
    const entries = Array.isArray(club.meetingSchedule)
      ? club.meetingSchedule
      : []
    if (entries.length === 0) continue
    scheduled++
    if (entries.some(e => meetingEntryMatchesMode(e, 'online'))) onlineCapable++
    if (entries.some(e => meetingEntryMatchesMode(e, 'in-person'))) inPerson++
    if (mode !== 'all' && entries.every(e => e.mode === undefined))
      modeNotStated++
    for (const e of entries) {
      if (!meetingEntryMatchesMode(e, mode)) continue
      const d = days.indexOf(e.day)
      if (d < 0) continue
      const h = meetingEntryHour(e)
      if (h === null) noTime[d]!.add(club.clubId)
      else cells[d]![h]!.add(club.clubId)
    }
  }

  return {
    counts: cells.map(row => row.map(s => s.size)),
    noTime: noTime.map(s => s.size),
    clubs: clubs.length,
    scheduled,
    modeNotStated,
    inPerson,
    onlineCapable,
  }
}
