/**
 * `snapshots/{date}/meeting-times.json` — weekday × start-hour counts of the
 * clubs' parsed meeting schedules, per district, for the region and world
 * meeting-time heatmaps (#1814, epic #1781). See the shared-contracts schema
 * for the shape.
 *
 * The rules this module holds:
 *
 * 1. **The same entity set as region-rollups.json and the club shards.**
 *    District files are scoped by the date's own `all-districts-rankings.json`,
 *    read in sorted order, and a club in two files is kept in the first. So a
 *    region's grid (Σ its districts) counts each club once.
 * 2. **Each program year's own regions**, from the snapshot's logical date,
 *    via {@link resolveRegionMembership} (the region-rollups helper).
 * 3. **One counting rule**, {@link countMeetingSlots} from shared-contracts,
 *    which the district page uses too: per district and mode, the grids are
 *    exactly what `/district/:id/meetings` shows.
 * 4. **Counts only.** No club id, name, free text, link or place is
 *    written; only `meetingSchedule[]` (#1789) is read.
 * 5. **Deterministic bytes**: districts are keyed in sorted order.
 *
 * Pure except for {@link readMeetingTimesInput}, the one filesystem door.
 *
 * @module @taverns-red/analytics-core/rollup
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MEETING_TIMES_FORMAT,
  MEETING_TIMES_MODES,
  countMeetingSlots,
  districtIdFromSnapshotFileName,
  isDistrictSnapshotFile,
  normalizeClubId,
  type DistrictRanking,
  type DistrictRegionHistory,
  type MeetingScheduleEntry,
  type MeetingSlotClub,
  type MeetingTimes,
  type MeetingTimesDistrict,
  type MeetingTimesGrid,
  type MeetingTimesMode,
} from '@taverns-red/shared-contracts'
import { canonicalDistrictId, readSnapshotRankings } from './globalRollup.js'
import { programYearForSnapshotDate } from './globalTotals.js'
import { resolveRegionMembership } from './regionRollups.js'

export interface MeetingTimesDistrictInput {
  readonly districtId: string
  readonly clubs: readonly MeetingSlotClub[]
}

export interface MeetingTimesInput {
  /** The snapshot's logical date (YYYY-MM-DD). */
  readonly snapshotDate: string
  /** The date's own rankings rows — the district set. */
  readonly rankings: readonly Pick<DistrictRanking, 'districtId'>[]
  readonly districts: readonly MeetingTimesDistrictInput[]
  /** null when the pipeline had no history to read. */
  readonly regionHistory: DistrictRegionHistory | null
  readonly regionHistoryNote?: string
  readonly generatedAt?: string
}

export interface MeetingTimesResult {
  readonly meetingTimes: MeetingTimes
  /** Rankings districts with no district file: the writer must refuse. */
  readonly missingDistricts: string[]
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

export function buildMeetingTimes(
  input: MeetingTimesInput
): MeetingTimesResult {
  const { snapshotDate } = input
  const programYear = programYearForSnapshotDate(snapshotDate)
  const { regionOf, note, membership } = resolveRegionMembership(
    input.regionHistory,
    programYear,
    input.regionHistoryNote
  )

  const scope = new Set(
    input.rankings.map(r => canonicalDistrictId(r.districtId))
  )
  const sorted = [...input.districts].sort((a, b) =>
    byString(a.districtId, b.districtId)
  )

  const seenDistricts = new Set<string>()
  const seenClubs = new Set<string>()
  const districts: Record<string, MeetingTimesDistrict> = {}
  let clubs = 0
  let scheduled = 0
  for (const district of sorted) {
    const key = canonicalDistrictId(district.districtId)
    if (!scope.has(key) || seenDistricts.has(key)) continue
    seenDistricts.add(key)

    const own: MeetingSlotClub[] = []
    for (const club of district.clubs) {
      const id = normalizeClubId(club.clubId)
      if (seenClubs.has(id)) continue
      seenClubs.add(id)
      own.push({ ...club, clubId: id })
    }

    const modes = {} as Record<MeetingTimesMode, MeetingTimesGrid>
    let row: Omit<MeetingTimesDistrict, 'modes' | 'region'> | null = null
    for (const mode of MEETING_TIMES_MODES) {
      const c = countMeetingSlots(own, mode)
      modes[mode] = {
        counts: c.counts,
        noTime: c.noTime,
        modeNotStated: c.modeNotStated,
      }
      row ??= {
        clubs: c.clubs,
        scheduled: c.scheduled,
        inPerson: c.inPerson,
        onlineCapable: c.onlineCapable,
      }
    }
    districts[district.districtId] = {
      region: regionOf ? regionOf(district.districtId) : null,
      ...row!,
      modes,
    }
    clubs += row!.clubs
    scheduled += row!.scheduled
  }

  const missingDistricts = input.rankings
    .map(r => r.districtId)
    .filter(id => !seenDistricts.has(canonicalDistrictId(id)))

  const meetingTimes: MeetingTimes = {
    _format: MEETING_TIMES_FORMAT,
    snapshotDate,
    programYear,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    timeBasis: 'local',
    regionMembership: membership,
    regionMembershipNote: note,
    totals: {
      districts: Object.keys(districts).length,
      clubs,
      scheduled,
    },
    districts,
  }
  return { meetingTimes, missingDistricts }
}

// ---------------------------------------------------------------------------
// Filesystem door
// ---------------------------------------------------------------------------

const isEntry = (e: unknown): e is MeetingScheduleEntry =>
  typeof e === 'object' &&
  e !== null &&
  typeof (e as { day?: unknown }).day === 'string'

/**
 * Read a snapshot directory: the date's rankings and, from every district
 * file's merged club records (`data.clubs`), only `clubId` and the parsed
 * `meetingSchedule[]`. A stray district file is returned too; the builder
 * excludes it by the rankings scope.
 */
export function readMeetingTimesInput(snapshotDir: string): {
  rankings: DistrictRanking[]
  districts: MeetingTimesDistrictInput[]
} {
  const rankings = readSnapshotRankings(snapshotDir)
  const districts: MeetingTimesDistrictInput[] = []
  for (const fileName of readdirSync(snapshotDir).sort()) {
    if (!isDistrictSnapshotFile(fileName)) continue
    const districtId = districtIdFromSnapshotFileName(fileName)
    if (!districtId) continue
    const parsed = JSON.parse(
      readFileSync(join(snapshotDir, fileName), 'utf-8')
    ) as { data?: { clubs?: Array<Record<string, unknown>> } }

    const clubs: MeetingSlotClub[] = []
    for (const club of parsed.data?.clubs ?? []) {
      const raw = club['clubId']
      const clubId = (typeof raw === 'string' ? raw : String(raw ?? '')).trim()
      if (clubId === '') continue
      const schedule = club['meetingSchedule']
      const entries = Array.isArray(schedule) ? schedule.filter(isEntry) : []
      clubs.push({
        clubId,
        ...(entries.length > 0 && { meetingSchedule: entries }),
      })
    }
    districts.push({ districtId, clubs })
  }
  return { rankings, districts }
}
