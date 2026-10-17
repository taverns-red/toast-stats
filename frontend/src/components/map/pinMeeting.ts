/**
 * Meeting pin modes (#1787, spec §4.2): meeting day and how members attend.
 * Both read the parsed Find-a-Club `meetingSchedule[]` (#1789) and the
 * `allowsVirtualAttendance` flag on each club — no extra fetch.
 *
 * "Online only" is a club whose every parsed meeting is online. The
 * collector derives each meeting's `mode` from the club's own MeetingDay /
 * MeetingTime / Location text (`FacMeetingSchedule`), so this module never
 * reads the free-text day, time or location, and never a meeting link.
 *
 * Absent is not zero: a club that publishes nothing is "Not stated"; a date
 * whose snapshot carries no such field for any club (before #1789, or an
 * enrichment-stripped date) is "Not available for this date".
 */
import type { MeetingWeekday } from '@taverns-red/shared-contracts'
import type { ClubTrend } from '../../hooks/useDistrictAnalytics'
import { WEEKDAYS } from '../../utils/meetingHeatmap'
import {
  CATEGORICAL8,
  SUSPENDED,
  withSuspended,
  type ModeModel,
  type PinCategory,
} from './pinModes'
import { NOT_AVAILABLE } from './pinReports'

export type MeetingPinMode = 'day' | 'attendance'

export const isMeetingMode = (m: string): m is MeetingPinMode =>
  m === 'day' || m === 'attendance'

/** The neutral "nothing published" fill (the app's not-yet / no-coach
 *  grey); drawn as a small dot, so it never reads as a category. */
const NOT_STATED_FILL = '#D6D3CC'

/** Spec §3.3 `attendance`, plus "Not stated". */
export const ATTENDANCE_FILLS = {
  inPerson: CATEGORICAL8[0],
  online: CATEGORICAL8[1],
  onlineOnly: CATEGORICAL8[2],
  notStated: NOT_STATED_FILL,
} as const

/** Fixed weekday hues, Monday first (spec §7.1), then several days and
 *  "Not stated". */
export const DAY_FILLS = {
  mon: CATEGORICAL8[0],
  tue: CATEGORICAL8[1],
  wed: CATEGORICAL8[2],
  thu: CATEGORICAL8[3],
  fri: CATEGORICAL8[4],
  sat: CATEGORICAL8[5],
  sun: CATEGORICAL8[6],
  several: CATEGORICAL8[7],
  notStated: NOT_STATED_FILL,
} as const

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

const NOT_STATED: PinCategory = {
  key: 'notStated',
  label: 'Not stated',
  fill: NOT_STATED_FILL,
  shape: 'dot',
}

const ATTENDANCE_CATS: PinCategory[] = [
  {
    key: 'inPerson',
    label: 'In person only',
    fill: ATTENDANCE_FILLS.inPerson,
    shape: 'circle',
  },
  {
    key: 'online',
    label: 'Online attendance possible',
    fill: ATTENDANCE_FILLS.online,
    shape: 'fill50',
  },
  {
    key: 'onlineOnly',
    label: 'Online only',
    fill: ATTENDANCE_FILLS.onlineOnly,
    shape: 'fill0',
  },
  NOT_STATED,
]

// The code label (`Tu`) is the non-colour channel (spec §3.2).
const DAY_CATS: PinCategory[] = [
  ...WEEKDAYS.map((day, i) => ({
    key: DAY_KEYS[i]!,
    label: day,
    fill: DAY_FILLS[DAY_KEYS[i]!],
    shape: 'circle' as const,
    code: day.slice(0, 2),
  })),
  {
    key: 'several',
    label: 'Several days',
    fill: DAY_FILLS.several,
    shape: 'circle',
    code: '2+',
  },
  NOT_STATED,
]

const schedule = (c: ClubTrend) =>
  Array.isArray(c.meetingSchedule) ? c.meetingSchedule : []

export type Attendance = 'inPerson' | 'online' | 'onlineOnly' | 'notStated'

/**
 * How a club's members can attend. The club's own schedule text wins over
 * the coarse FAC flag: every meeting online → online only; the flag or any
 * online / hybrid meeting → online possible; a stated "no" or an in-person
 * meeting → in person only; otherwise not stated.
 */
export function attendanceOf(c: ClubTrend): Attendance {
  const entries = schedule(c)
  if (entries.length > 0 && entries.every(e => e.mode === 'online'))
    return 'onlineOnly'
  if (
    c.allowsVirtualAttendance === true ||
    entries.some(e => e.mode === 'online' || e.mode === 'hybrid')
  )
    return 'online'
  if (
    c.allowsVirtualAttendance === false ||
    entries.some(e => e.mode === 'in-person')
  )
    return 'inPerson'
  return 'notStated'
}

function dayCategory(c: ClubTrend): PinCategory {
  const days = new Set<MeetingWeekday>(schedule(c).map(e => e.day))
  if (days.size === 0) return NOT_STATED
  if (days.size > 1) return DAY_CATS.find(d => d.key === 'several')!
  const i = WEEKDAYS.indexOf([...days][0]!)
  return DAY_CATS[i] ?? NOT_STATED
}

const hasSchedule = (c: ClubTrend) => Array.isArray(c.meetingSchedule)

/**
 * `date` is the viewed snapshot date (R3). `clubs` is every club in scope:
 * whether the date carries the source at all is a fact about the snapshot,
 * not one club. Without it (the picker's preview) the source is assumed.
 */
export function meetingModel(
  mode: MeetingPinMode,
  date: string,
  clubs?: readonly ClubTrend[]
): ModeModel {
  const scheduled = clubs === undefined || clubs.some(hasSchedule)
  const title = mode === 'day' ? 'Meeting day' : 'How members attend'
  const available =
    mode === 'day'
      ? scheduled
      : scheduled ||
        clubs!.some(c => typeof c.allowsVirtualAttendance === 'boolean')
  const categories = mode === 'day' ? DAY_CATS : ATTENDANCE_CATS
  const pick =
    mode === 'day'
      ? dayCategory
      : (c: ClubTrend) => categories.find(k => k.key === attendanceOf(c))!
  const note = !available
    ? `${title} is not available for ${date || 'this date'}.`
    : mode === 'attendance' && !scheduled
      ? 'Online-only clubs are counted under “Online attendance possible” for this date.'
      : undefined
  return {
    mode,
    title,
    // Attendance clusters take the most common way to attend; seven day
    // hues would mislead as a dominant fill, so day clusters are neutral.
    ...(mode === 'day'
      ? { kind: 'categorical' as const, fixedOrder: true }
      : { kind: 'status' as const }),
    categories: [...categories, NOT_AVAILABLE, SUSPENDED],
    categoryOf: withSuspended(c => (available ? pick(c) : NOT_AVAILABLE)),
    isDashed: () => false,
    facet: { param: mode, valueOf: c => c.key },
    ...(note ? { note } : {}),
  }
}
