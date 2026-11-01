/**
 * Snapshot-directory readers — the rollups' one filesystem door (#2447).
 *
 * Every rollup builder (`rollUpGlobal`, `buildRegionRollups`,
 * `buildClubsByRegion`, `buildMeetingTimes`) is pure and browser-safe. The
 * functions here read a snapshot directory from disk into those builders'
 * inputs, so they import `node:fs` and live apart from the builders: the
 * package's main entry stays free of Node built-ins (the frontend imports it),
 * and these are exported only from the node-only `./node` subpath
 * (`src/node.ts`).
 *
 * @module @taverns-red/analytics-core/node
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  districtIdFromSnapshotFileName,
  isDistrictSnapshotFile,
  normalizeClubId,
  parseCoordinates,
  type DistrictRanking,
  type MeetingScheduleEntry,
  type MeetingSlotClub,
  type ScrapedRecord,
} from '@taverns-red/shared-contracts'
import {
  OFFICER_TRAINING_ROUND_COLUMNS,
  officersTrainedInRound,
} from '../analytics/officerTraining.js'
import type {
  ClubPaymentRow,
  DistrictClubPayments,
  GlobalRollupInput,
} from './globalRollup.js'
import type {
  RegionRollupClub,
  RegionRollupDistrictInput,
} from './regionRollups.js'
import type {
  ClubsByRegionClubInput,
  ClubsByRegionDistrictInput,
} from './clubsByRegion.js'
import type { MeetingTimesDistrictInput } from './meetingTimes.js'

const num = (value: unknown): number => Number(value ?? 0) || 0
const str = (value: unknown): string =>
  typeof value === 'string' ? value : value == null ? '' : String(value)

// ---------------------------------------------------------------------------
// Worldwide rollup (#1466 / #1498)
// ---------------------------------------------------------------------------

/**
 * The date's own `all-districts-rankings.json` rows — the authoritative
 * district set, and the only surface whose tier fields are
 * distinguished-or-better plus subsets (#1124).
 */
export function readSnapshotRankings(snapshotDir: string): DistrictRanking[] {
  const raw = JSON.parse(
    readFileSync(join(snapshotDir, 'all-districts-rankings.json'), 'utf-8')
  ) as { rankings?: DistrictRanking[] }
  return (raw.rankings ?? []).filter(
    row => typeof row?.districtId === 'string' && row.districtId !== ''
  )
}

/**
 * Read one snapshot directory into rollup input: every `district_*.json` file
 * it holds, plus the district set `all-districts-rankings.json` lists for that
 * date. The two are read SEPARATELY on purpose — the whole point is that the
 * directory listing is not the district set.
 */
export function readSnapshotRollupInput(
  snapshotDir: string,
  snapshotDate?: string
): GlobalRollupInput {
  const rankingsDistrictIds = readSnapshotRankings(snapshotDir).map(
    row => row.districtId
  )

  const districts: DistrictClubPayments[] = []
  for (const fileName of readdirSync(snapshotDir).sort()) {
    if (!isDistrictSnapshotFile(fileName)) continue
    const districtId = districtIdFromSnapshotFileName(fileName)
    if (!districtId) continue

    const parsed = JSON.parse(
      readFileSync(join(snapshotDir, fileName), 'utf-8')
    ) as {
      data?: {
        districtPerformance?: Array<Record<string, unknown>>
        clubPerformance?: Array<Record<string, unknown>>
        clubs?: Array<{ clubId?: unknown; address?: { country?: unknown } }>
      }
    }

    // Three arrays inside one file, joined on the canonical club id: payments
    // and club status live on `districtPerformance`, "Active Members" on
    // `clubPerformance`, and the Find-A-Club country on `clubs[].address`.
    // The join happens once, here, so the rollup itself stays pure.
    const membership = new Map<string, number>()
    for (const row of parsed.data?.clubPerformance ?? []) {
      const clubId = String(row['Club Number'] ?? '').trim()
      if (clubId === '') continue
      membership.set(
        normalizeClubId(clubId),
        Number(row['Active Members'] ?? 0) || 0
      )
    }
    const country = new Map<string, string>()
    for (const club of parsed.data?.clubs ?? []) {
      const clubId = String(club?.clubId ?? '').trim()
      const name = club?.address?.country
      if (clubId === '' || typeof name !== 'string' || name.trim() === '')
        continue
      country.set(normalizeClubId(clubId), name.trim())
    }

    const clubs: ClubPaymentRow[] = []
    for (const row of parsed.data?.districtPerformance ?? []) {
      const clubId = String(row['Club'] ?? '').trim()
      if (clubId === '') continue
      const key = normalizeClubId(clubId)
      clubs.push({
        clubId,
        payments: Number(row['Total to Date'] ?? 0) || 0,
        activeMembers: membership.get(key) ?? 0,
        clubStatusField: String(row['Charter Date/Suspend Date'] ?? ''),
        country: country.get(key),
      })
    }
    districts.push({ districtId, clubs })
  }

  return { districts, rankingsDistrictIds, snapshotDate }
}

// ---------------------------------------------------------------------------
// Region rollups (#1799)
// ---------------------------------------------------------------------------

/** A `0/1` flag column; undefined when the row or the column is absent. */
function flag(
  row: Record<string, unknown> | undefined,
  column: string
): boolean | undefined {
  if (!row || !(column in row)) return undefined
  const value = String(row[column] ?? '').trim()
  return value !== '' && value !== '0'
}

/** A row's `Off. Trained Round 1/2` cells, read as goal 9 reads them and
 *  clamped into 0–7 (#2296); a round whose column is absent is left out. */
function officersTrained(
  row: Record<string, unknown> | undefined
): Pick<RegionRollupClub, 'officersTrainedRound1' | 'officersTrainedRound2'> {
  if (!row) return {}
  const record = row as ScrapedRecord
  const carries = (round: 1 | 2): boolean =>
    OFFICER_TRAINING_ROUND_COLUMNS[round - 1]!.aliases.some(
      alias => alias in row
    )
  return {
    ...(carries(1) && {
      officersTrainedRound1: officersTrainedInRound(record, 1),
    }),
    ...(carries(2) && {
      officersTrainedRound2: officersTrainedInRound(record, 2),
    }),
  }
}

interface SnapshotFile {
  data?: {
    clubs?: Array<Record<string, unknown>>
    clubPerformance?: Array<Record<string, unknown>>
    districtPerformance?: Array<Record<string, unknown>>
    prospectiveClubs?: unknown[]
  }
}

/**
 * Read a snapshot directory: the date's rankings and every district file's
 * clubs (`data.clubs`, the transform's merged club records), each joined to
 * its club-performance flags and district-performance charter/suspend cell
 * on the canonical club id. A stray district file is returned too; the
 * builder excludes it by the rankings scope.
 */
export function readRegionRollupInput(snapshotDir: string): {
  rankings: DistrictRanking[]
  /** The rankings' own `metadata.snapshotId` (often the collection date). */
  rankingsSnapshotId: string | null
  districts: RegionRollupDistrictInput[]
} {
  const rankings = readSnapshotRankings(snapshotDir)
  const rankingsRaw = JSON.parse(
    readFileSync(join(snapshotDir, 'all-districts-rankings.json'), 'utf-8')
  ) as { metadata?: { snapshotId?: unknown } }
  const snapshotId = rankingsRaw.metadata?.snapshotId

  const districts: RegionRollupDistrictInput[] = []
  for (const fileName of readdirSync(snapshotDir).sort()) {
    if (!isDistrictSnapshotFile(fileName)) continue
    const districtId = districtIdFromSnapshotFileName(fileName)
    if (!districtId) continue
    const parsed = JSON.parse(
      readFileSync(join(snapshotDir, fileName), 'utf-8')
    ) as SnapshotFile
    const data = parsed.data ?? {}

    const performance = new Map<string, Record<string, unknown>>()
    for (const row of data.clubPerformance ?? []) {
      const id = String(row['Club Number'] ?? '').trim()
      if (id !== '') performance.set(normalizeClubId(id), row)
    }
    const statusCell = new Map<string, string>()
    for (const row of data.districtPerformance ?? []) {
      const id = String(row['Club'] ?? '').trim()
      if (id === '') continue
      statusCell.set(
        normalizeClubId(id),
        String(row['Charter Date/Suspend Date'] ?? '')
      )
    }

    const clubs: RegionRollupClub[] = []
    for (const club of data.clubs ?? []) {
      const rawId = String(club['clubId'] ?? '').trim()
      if (rawId === '') continue
      const id = normalizeClubId(rawId)
      const perf = performance.get(id)
      const status = club['clubStatus'] ?? club['status']
      const csp = club['cspSubmitted']
      clubs.push({
        clubId: rawId,
        membershipCount: num(club['membershipCount']),
        membershipBase: num(club['membershipBase']),
        paymentsCount: num(club['paymentsCount']),
        dcpGoals: num(club['dcpGoals']),
        ...(typeof status === 'string' && { clubStatus: status }),
        ...(typeof csp === 'boolean' && { cspSubmitted: csp }),
        octoberDuesOnTime: flag(perf, 'Mem. dues on time Oct'),
        aprilDuesOnTime: flag(perf, 'Mem. dues on time Apr'),
        officerListOnTime: flag(perf, 'Off. List On Time'),
        charterSuspendField: statusCell.get(id),
        ...officersTrained(perf),
      })
    }
    districts.push({
      districtId,
      clubs,
      prospectiveClubs: Array.isArray(data.prospectiveClubs)
        ? data.prospectiveClubs.length
        : null,
    })
  }

  return {
    rankings,
    rankingsSnapshotId: typeof snapshotId === 'string' ? snapshotId : null,
    districts,
  }
}

// ---------------------------------------------------------------------------
// Clubs by region (#1800)
// ---------------------------------------------------------------------------

/**
 * Read a snapshot directory: the date's rankings and every district file's
 * merged club records (`data.clubs`). Only the fields the shards carry are
 * read; contact, link and meeting fields never leave the file. A stray
 * district file is returned too; the builder excludes it by the rankings
 * scope.
 */
export function readClubsByRegionInput(snapshotDir: string): {
  rankings: DistrictRanking[]
  districts: ClubsByRegionDistrictInput[]
} {
  const rankings = readSnapshotRankings(snapshotDir)
  const districts: ClubsByRegionDistrictInput[] = []
  for (const fileName of readdirSync(snapshotDir).sort()) {
    if (!isDistrictSnapshotFile(fileName)) continue
    const districtId = districtIdFromSnapshotFileName(fileName)
    if (!districtId) continue
    const parsed = JSON.parse(
      readFileSync(join(snapshotDir, fileName), 'utf-8')
    ) as { data?: { clubs?: Array<Record<string, unknown>> } }

    const clubs: ClubsByRegionClubInput[] = []
    for (const club of parsed.data?.clubs ?? []) {
      const clubId = str(club['clubId']).trim()
      if (clubId === '') continue
      const status = club['clubStatus'] ?? club['status']
      const csp = club['cspSubmitted']
      const coords = parseCoordinates(club['coordinates'])
      const address = club['address'] as { city?: unknown } | null | undefined
      const city = typeof address?.city === 'string' ? address.city : ''
      clubs.push({
        clubId,
        clubName: str(club['clubName']),
        divisionId: str(club['divisionId']),
        areaId: str(club['areaId']),
        membershipCount: num(club['membershipCount']),
        membershipBase: num(club['membershipBase']),
        dcpGoals: num(club['dcpGoals']),
        aprilRenewals: num(club['aprilRenewals']),
        ...(typeof status === 'string' && { clubStatus: status }),
        ...(typeof csp === 'boolean' && { cspSubmitted: csp }),
        ...(coords && { coordinates: coords }),
        ...(city.trim() !== '' && { city: city.trim() }),
        ...(club['meetsOnline'] === true && { meetsOnline: true as const }),
      })
    }
    districts.push({ districtId, clubs })
  }
  return { rankings, districts }
}

// ---------------------------------------------------------------------------
// Meeting times (#1814)
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
