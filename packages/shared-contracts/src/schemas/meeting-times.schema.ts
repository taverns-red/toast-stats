/**
 * Zod contract for `snapshots/{date}/meeting-times.json` — when clubs meet,
 * as weekday × start-hour counts per district, for the region and world
 * meeting-time heatmaps (#1814, epic #1781).
 *
 * The district heatmap (#1796) counts the parsed `meetingSchedule[]` (#1789)
 * of the clubs in one analytics file. Region and world pages would need ~100
 * of those, so the pipeline counts once and publishes counts only: no club
 * id, name, free text, link or place. Region and world grids are sums of
 * the district grids, which is exact because each club is counted in one
 * district (the entity set is deduplicated, like region-rollups.json).
 *
 * Rules the shape encodes:
 * - **One rule.** Every grid is {@link countMeetingSlots} (shared with the
 *   district page): a cell is the number of DISTINCT clubs with a meeting
 *   that starts in that weekday and hour, in that mode.
 * - **Modes, as on the district page.** `all` is any meeting; `in-person` is
 *   an in-person or hybrid meeting; `online` is an online or hybrid one. A
 *   hybrid club is in both mode grids, so modes are not summed.
 * - **Local time.** Start times are each club's own local clock time as its
 *   Find-a-Club listing states it (`timeBasis: 'local'`); nothing is
 *   converted between time zones.
 * - **Nothing dropped.** A club with no parsed schedule is `clubs −
 *   scheduled`; a meeting with a weekday but no time is in `noTime`; in a
 *   mode grid, a club whose schedule states no mode is `modeNotStated`.
 * - **Each program year's own regions**, from the snapshot's logical date,
 *   like region-rollups.json; `null` when there is no usable history.
 *
 * Tolerant reader: objects are not strict, so a later optional key never
 * breaks a reader that does not know it (#2183).
 *
 * @module meeting-times.schema
 */

import { z } from 'zod'

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const ProgramYear = z.string().regex(/^\d{4}-\d{4}$/)
const Count = z.number().int().nonnegative()

export const MEETING_TIMES_VERSION = '1.0.0'

/** The published file name, so writer and reader cannot drift apart. */
export const MEETING_TIMES_FILE_NAME = 'meeting-times.json'

/** The three views, in the district page's order. */
export const MEETING_TIMES_MODES = ['all', 'in-person', 'online'] as const
export type MeetingTimesMode = (typeof MEETING_TIMES_MODES)[number]

export const MeetingTimesFormatSchema = z.object({
  version: z.string(),
  type: z.literal('meeting-times'),
})

/** One mode's grid: [weekday 0 = Monday][hour 0–23] → distinct clubs. */
export const MeetingTimesGridSchema = z.object({
  counts: z.array(z.array(Count).length(24)).length(7),
  /** Per weekday: clubs with a meeting that day whose time is not stated. */
  noTime: z.array(Count).length(7),
  /** Scheduled clubs whose schedule states no mode (0 in `all`). */
  modeNotStated: Count,
})

export const MeetingTimesDistrictSchema = z.object({
  /** The district's region for the program year; null = not placed. */
  region: z.string().nullable(),
  clubs: Count,
  /** Clubs with at least one parsed meeting. */
  scheduled: Count,
  /** Clubs with an in-person or hybrid meeting. */
  inPerson: Count,
  /** Clubs with an online or hybrid meeting. */
  onlineCapable: Count,
  modes: z.object({
    all: MeetingTimesGridSchema,
    'in-person': MeetingTimesGridSchema,
    online: MeetingTimesGridSchema,
  }),
})

const RegionMembershipSchema = z.object({
  source: z.literal('config/district-region-history.json'),
  asOf: IsoDate,
  programYear: ProgramYear,
})

export const MeetingTimesSchema = z.object({
  _format: MeetingTimesFormatSchema,
  snapshotDate: IsoDate,
  programYear: ProgramYear,
  generatedAt: z.string(),
  /** Start hours are each club's local time; never converted. */
  timeBasis: z.literal('local'),
  regionMembership: RegionMembershipSchema.nullable(),
  regionMembershipNote: z.string().nullable(),
  totals: z.object({
    districts: Count,
    clubs: Count,
    scheduled: Count,
  }),
  /** Every in-scope district, keyed by its id. */
  districts: z.record(z.string(), MeetingTimesDistrictSchema),
})

export type MeetingTimesFormat = z.infer<typeof MeetingTimesFormatSchema>
export type MeetingTimesGrid = z.infer<typeof MeetingTimesGridSchema>
export type MeetingTimesDistrict = z.infer<typeof MeetingTimesDistrictSchema>
export type MeetingTimes = z.infer<typeof MeetingTimesSchema>

/** The `_format` envelope every writer stamps on the artifact. */
export const MEETING_TIMES_FORMAT: MeetingTimesFormat = {
  version: MEETING_TIMES_VERSION,
  type: 'meeting-times',
}
