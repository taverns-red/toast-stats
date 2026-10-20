/**
 * The meeting-time counting rule (#1796, #1814) — one definition for the
 * district heatmap and the pipeline's `meeting-times.json`.
 *
 * @module meeting/meetingSlots
 */
import type { MeetingScheduleEntry } from '../types/district-statistics-file.js'
import type { MeetingTimesMode } from '../schemas/meeting-times.schema.js'

/** The fields the rule reads from a club. */
export interface MeetingSlotClub {
  readonly clubId: string
  readonly meetingSchedule?: readonly MeetingScheduleEntry[] | null
}

export interface MeetingSlotCounts {
  counts: number[][]
  noTime: number[]
  clubs: number
  scheduled: number
  modeNotStated: number
  inPerson: number
  onlineCapable: number
}

export function countMeetingSlots(
  _clubs: readonly MeetingSlotClub[],
  _mode: MeetingTimesMode
): MeetingSlotCounts {
  throw new Error('not implemented (#1814)')
}
