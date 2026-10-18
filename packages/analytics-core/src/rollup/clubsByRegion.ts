/**
 * `snapshots/{date}/clubs-by-region/` — one shard per region with every club
 * the region and world explorers draw or list, plus `world.json` and its
 * lazily loaded `world-points.json` (#1800,
 * epic #1781). See the shared-contracts schema for the shape.
 *
 * The rules this module holds:
 *
 * 1. **The same entity set as region-rollups.json.** District files are
 *    scoped by the date's own `all-districts-rankings.json`, read in sorted
 *    order, and a club in two files is kept in the first (reported). Health
 *    and tier come from {@link classifyRollupClub} and regions from
 *    {@link resolveRegionMembership}, the helpers region-rollups uses, so a
 *    shard's pins and its region's rollup cannot disagree.
 * 2. **Each program year's own regions**, from the snapshot's logical date
 *    (CLAUDE.md tripwire, #1284), never from the rankings' `region` column.
 * 3. **Counted, not dropped.** A club without coordinates stays a row
 *    (`lat`/`lng` null) and is counted as unmapped; a district the history
 *    does not place goes to the `unassigned` shard. No usable history → no
 *    shards and `world.shards: null` with the reason; the world file is
 *    still built.
 * 4. **Explorer fields only.** Names are passed through `stripLinks`; no
 *    contact, link or meeting field is read, so none can be written.
 * 5. **Deterministic bytes** (Lesson 158): rows and points are arrays sorted
 *    by club id, so the output is identical whatever order files arrive in.
 *
 * Pure except for {@link readClubsByRegionInput}, the one filesystem door.
 *
 * @module @taverns-red/analytics-core/rollup
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CLUBS_BY_REGION_DIR,
  CLUBS_BY_REGION_SHARD_FORMAT,
  CLUBS_BY_REGION_TOP_N,
  CLUBS_BY_REGION_UNASSIGNED,
  CLUBS_BY_REGION_WORLD_FORMAT,
  CLUBS_BY_REGION_WORLD_POINTS_FORMAT,
  CLUBS_BY_REGION_WORLD_POINTS_PATH,
  clubsByRegionShardFileName,
  districtIdFromSnapshotFileName,
  isDistrictSnapshotFile,
  normalizeClubId,
  stripLinks,
  type ClubsByRegionClub,
  type ClubsByRegionHealth,
  type ClubsByRegionPoint,
  type ClubsByRegionShard,
  type ClubsByRegionTopMetric,
  type ClubsByRegionWorld,
  type ClubsByRegionWorldPoints,
  type DistrictRanking,
  type DistrictRegionHistory,
} from '@taverns-red/shared-contracts'
import { getCurrentProgramMonth } from '../analytics/AnalyticsUtils.js'
import { isDistinguishedProvisional } from '../analytics/ClubEligibilityUtils.js'
import { canonicalDistrictId, readSnapshotRankings } from './globalRollup.js'
import { programYearForSnapshotDate } from './globalTotals.js'
import { classifyRollupClub, resolveRegionMembership } from './regionRollups.js'

/** One club as the shard builder reads it from a district snapshot. */
export interface ClubsByRegionClubInput {
  readonly clubId: string
  readonly clubName: string
  readonly divisionId: string
  readonly areaId: string
  readonly membershipCount: number
  readonly membershipBase: number
  readonly dcpGoals: number
  readonly aprilRenewals: number
  readonly clubStatus?: string
  readonly cspSubmitted?: boolean
  readonly coordinates?: { readonly lat: number; readonly lng: number }
  readonly city?: string
}

export interface ClubsByRegionDistrictInput {
  readonly districtId: string
  readonly clubs: readonly ClubsByRegionClubInput[]
}

export interface ClubsByRegionInput {
  /** The snapshot's logical date (YYYY-MM-DD). */
  readonly snapshotDate: string
  /** The date's own rankings rows — the district set. */
  readonly rankings: readonly Pick<DistrictRanking, 'districtId'>[]
  readonly districts: readonly ClubsByRegionDistrictInput[]
  /** null when the pipeline had no history to read. */
  readonly regionHistory: DistrictRegionHistory | null
  readonly regionHistoryNote?: string
  readonly generatedAt?: string
}

export interface ClubsByRegionResult {
  readonly world: ClubsByRegionWorld
  /** The map points, a separate lazily loaded file. */
  readonly worldPoints: ClubsByRegionWorldPoints
  /** Sorted by region key; empty when there is no usable history. */
  readonly shards: ClubsByRegionShard[]
  /** Rankings districts with no district file: the writer must refuse. */
  readonly missingDistricts: string[]
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** Club ids are digit strings: shorter first, then lexicographic. */
const byClubId = (a: string, b: string): number =>
  a.length - b.length || byString(a, b)

const HEALTH_CODE: Record<string, ClubsByRegionHealth> = {
  thriving: 't',
  vulnerable: 'v',
  'intervention-required': 'i',
}

const validCoordinates = (
  c: ClubsByRegionClubInput['coordinates']
): c is { lat: number; lng: number } =>
  c !== undefined &&
  Number.isFinite(c.lat) &&
  Number.isFinite(c.lng) &&
  Math.abs(c.lat) <= 90 &&
  Math.abs(c.lng) <= 180

const TOP_VALUE: Record<
  ClubsByRegionTopMetric,
  (c: ClubsByRegionClub) => number
> = {
  membership: c => c.members,
  netGrowth: c => c.members - c.base,
  dcpGoals: c => c.dcpGoals,
}

function topList(
  clubs: readonly ClubsByRegionClub[],
  metric: ClubsByRegionTopMetric
): ClubsByRegionClub[] {
  const value = TOP_VALUE[metric]
  return [...clubs]
    .sort((a, b) => value(b) - value(a) || byClubId(a.id, b.id))
    .slice(0, CLUBS_BY_REGION_TOP_N)
}

export function buildClubsByRegion(
  input: ClubsByRegionInput
): ClubsByRegionResult {
  const { snapshotDate } = input
  const programYear = programYearForSnapshotDate(snapshotDate)
  const month = getCurrentProgramMonth(snapshotDate)
  const dataMonth = Number.parseInt(snapshotDate.slice(5, 7), 10)
  const generatedAt = input.generatedAt ?? new Date().toISOString()

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

  // The one merged entity set: in-scope districts, clubs deduplicated.
  const excludedDistricts: string[] = []
  const seenDistricts = new Set<string>()
  const inScopeDistricts: string[] = []
  const clubHome = new Map<string, string[]>()
  const rows: ClubsByRegionClub[] = []
  for (const district of sorted) {
    const key = canonicalDistrictId(district.districtId)
    if (!scope.has(key) || seenDistricts.has(key)) {
      excludedDistricts.push(district.districtId)
      continue
    }
    seenDistricts.add(key)
    inScopeDistricts.push(district.districtId)
    const region = regionOf ? regionOf(district.districtId) : null
    for (const club of district.clubs) {
      const id = normalizeClubId(club.clubId)
      const home = clubHome.get(id)
      if (home) {
        home.push(district.districtId)
        continue
      }
      clubHome.set(id, [district.districtId])
      const { health, level } = classifyRollupClub(club, month, programYear)
      const tier = level === 'NotDistinguished' ? null : level
      const located = validCoordinates(club.coordinates)
        ? club.coordinates
        : null
      rows.push({
        id,
        name: stripLinks(club.clubName),
        d: district.districtId,
        region,
        division: club.divisionId,
        area: club.areaId,
        city: club.city ? stripLinks(club.city) : null,
        status: club.clubStatus ?? null,
        h: HEALTH_CODE[health]!,
        t: tier,
        tp: isDistinguishedProvisional(
          level,
          club.aprilRenewals,
          club.membershipBase,
          dataMonth
        ),
        members: club.membershipCount,
        base: club.membershipBase,
        dcpGoals: club.dcpGoals,
        csp: club.cspSubmitted ?? null,
        lat: located ? located.lat : null,
        lng: located ? located.lng : null,
      })
    }
  }
  rows.sort((a, b) => byClubId(a.id, b.id))

  const missingDistricts = input.rankings
    .map(r => r.districtId)
    .filter(id => !seenDistricts.has(canonicalDistrictId(id)))

  const mappedCount = (clubs: readonly ClubsByRegionClub[]): number =>
    clubs.filter(c => c.lat !== null).length

  // Shards: one per region of the program year, plus the unassigned ones.
  const shards: ClubsByRegionShard[] = []
  let shardEntries: ClubsByRegionWorld['shards'] = null
  if (regionOf && membership) {
    const members = new Map<string, string[]>()
    for (const districtId of inScopeDistricts) {
      const key = regionOf(districtId) ?? CLUBS_BY_REGION_UNASSIGNED
      members.set(key, [...(members.get(key) ?? []), districtId])
    }
    shardEntries = {}
    for (const key of [...members.keys()].sort(byString)) {
      const districtIds = members.get(key)!
      const ids = new Set(districtIds)
      const clubs = rows.filter(c => ids.has(c.d))
      const mapped = mappedCount(clubs)
      shards.push({
        _format: CLUBS_BY_REGION_SHARD_FORMAT,
        snapshotDate,
        programYear,
        generatedAt,
        region: key,
        regionMembership: membership,
        districtIds,
        counts: {
          clubs: clubs.length,
          mapped,
          unmapped: clubs.length - mapped,
        },
        clubs,
      })
      shardEntries[key] = {
        path: `${CLUBS_BY_REGION_DIR}/${clubsByRegionShardFileName(key)}`,
        districtIds,
        clubs: clubs.length,
        mapped,
        unmapped: clubs.length - mapped,
        health: {
          thriving: clubs.filter(c => c.h === 't').length,
          vulnerable: clubs.filter(c => c.h === 'v').length,
          interventionRequired: clubs.filter(c => c.h === 'i').length,
        },
      }
    }
  }

  const points: ClubsByRegionPoint[] = rows
    .filter(c => c.lat !== null && c.lng !== null)
    .map(c => [c.id, c.lat!, c.lng!, c.d, c.h])

  const duplicateClubs = [...clubHome]
    .filter(([, homes]) => homes.length > 1)
    .map(([clubId, districtIds]) => ({ clubId, districtIds }))
    .sort((a, b) => byClubId(a.clubId, b.clubId))

  const world: ClubsByRegionWorld = {
    _format: CLUBS_BY_REGION_WORLD_FORMAT,
    snapshotDate,
    programYear,
    generatedAt,
    regionMembership: membership,
    regionMembershipNote: note,
    totals: {
      districts: inScopeDistricts.length,
      clubs: rows.length,
      mapped: points.length,
      unmapped: rows.length - points.length,
    },
    shards: shardEntries,
    top: {
      membership: topList(rows, 'membership'),
      netGrowth: topList(rows, 'netGrowth'),
      dcpGoals: topList(rows, 'dcpGoals'),
    },
    pointsPath: CLUBS_BY_REGION_WORLD_POINTS_PATH,
    scope: { excludedDistricts, duplicateClubs },
  }
  const worldPoints: ClubsByRegionWorldPoints = {
    _format: CLUBS_BY_REGION_WORLD_POINTS_FORMAT,
    snapshotDate,
    programYear,
    generatedAt,
    count: points.length,
    points,
  }

  return { world, worldPoints, shards, missingDistricts }
}

// ---------------------------------------------------------------------------
// Filesystem door
// ---------------------------------------------------------------------------

const num = (value: unknown): number => Number(value ?? 0) || 0
const str = (value: unknown): string =>
  typeof value === 'string' ? value : value == null ? '' : String(value)

/** A `{lat, lng}` pair of finite numbers, else undefined. */
function coordinates(value: unknown): { lat: number; lng: number } | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { lat, lng } = value as { lat?: unknown; lng?: unknown }
  return typeof lat === 'number' && typeof lng === 'number'
    ? { lat, lng }
    : undefined
}

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
      const coords = coordinates(club['coordinates'])
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
      })
    }
    districts.push({ districtId, clubs })
  }
  return { rankings, districts }
}
