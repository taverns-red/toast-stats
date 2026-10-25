/**
 * `snapshots/{date}/region-rollups.json` — region and world rollups of the
 * district figures for one snapshot date (#1799, epic #1781).
 *
 * The rules this module holds (see the shared-contracts schema for the
 * shape):
 *
 * 1. **One merged entity set** (Lesson 157). The clubs of every district
 *    file the date's own `all-districts-rankings.json` lists are read once,
 *    deduplicated on the canonical club id (first file wins, the duplicate
 *    is reported), and every block — district, region, world — is a
 *    grouping of that one list. `world = Σ districts` and
 *    `region = Σ its districts` hold by construction.
 * 2. **Each program year's own regions.** The program year comes from the
 *    snapshot's logical date (`snapshotDate`, the directory name), never
 *    from the rankings' collection date: the 2026-06-30 close was collected
 *    on 2026-07-25 and is still 2025-26 (CLAUDE.md tripwire, #1284).
 *    Membership is `config/district-region-history.json`'s `byProgramYear`
 *    for that year (#1820).
 * 3. **Absent is not zero.** A figure whose source column a district does
 *    not carry is `null` for that district and for every block containing
 *    it. Charter and suspension counts use a date-wide presence signal
 *    (any parseable date on any in-scope club, in or out of the window),
 *    one scope wider than the count (the #1514 principle).
 * 4. **Degrade per row.** A listed district without a file is returned in
 *    `missingDistricts` for the writer to refuse on (ADR-015 P3); a district
 *    the history does not place is unassigned, not dropped; no usable
 *    history leaves `regions: null` with the reason, the world still built.
 *
 * Classification reuses the shared rules — `classifyClubHealth` (#1120) and
 * the program year's distinguished ladder (#1406) — exactly as the
 * district club-health analytics apply them to a snapshot's clubs.
 *
 * Pure except for {@link readRegionRollupInput}, the one filesystem door.
 *
 * @module @taverns-red/analytics-core/rollup
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  districtIdFromSnapshotFileName,
  isDistrictSnapshotFile,
  normalizeClubId,
  REGION_ROLLUPS_FORMAT,
  REGION_ROLLUPS_REGION_SOURCE,
  type DistrictRanking,
  type DistrictRegionHistory,
  type RegionRollupDistrict,
  type RegionRollupFigures,
  type RegionRollupRegion,
  type RegionRollups,
} from '@taverns-red/shared-contracts'
import type { ClubHealthStatus, DistinguishedLevel } from '../types.js'
import { getCurrentProgramMonth } from '../analytics/AnalyticsUtils.js'
import {
  classifyClubHealth,
  determineDistinguishedLevel,
  getCSPStatus,
  isClubSmedleyAvailable,
} from '../analytics/ClubEligibilityUtils.js'
import {
  getProgramYearStartDate,
  parseCharterDateFromStatusField,
  parseDateFlexible,
  parseSuspendDateFromStatusField,
} from '../rankings/programYearDates.js'
import { canonicalDistrictId, readSnapshotRankings } from './globalRollup.js'
import { programYearForSnapshotDate } from './globalTotals.js'
import {
  OFFICER_TRAINING_MAX_OFFICERS,
  OFFICER_TRAINING_ROUND_COLUMNS,
  officersTrainedInRound,
} from '../analytics/officerTraining.js'
import type {
  OfficerTrainingDistribution,
  ScrapedRecord,
} from '@taverns-red/shared-contracts'

/** One club as the rollup reads it; `undefined` = the column is absent. */
export interface RegionRollupClub {
  readonly clubId: string
  readonly membershipCount: number
  readonly membershipBase: number
  readonly paymentsCount: number
  readonly dcpGoals: number
  readonly clubStatus?: string
  readonly cspSubmitted?: boolean
  readonly octoberDuesOnTime?: boolean
  readonly aprilDuesOnTime?: boolean
  readonly officerListOnTime?: boolean
  /** The district-performance `Charter Date/Suspend Date` cell. */
  readonly charterSuspendField?: string
  /** `Off. Trained Round 1` / `Round 2`, 0–7 (#2296); undefined = absent. */
  readonly officersTrainedRound1?: number
  readonly officersTrainedRound2?: number
}

export interface RegionRollupDistrictInput {
  readonly districtId: string
  readonly clubs: readonly RegionRollupClub[]
  /** Find-A-Club prospective clubs; null = not merged for this district. */
  readonly prospectiveClubs: number | null
}

export interface RegionRollupsInput {
  /** The snapshot's logical date (YYYY-MM-DD) — the key for every window. */
  readonly snapshotDate: string
  /** The date's own rankings rows — the district set. */
  readonly rankings: readonly Pick<DistrictRanking, 'districtId'>[]
  readonly districts: readonly RegionRollupDistrictInput[]
  /** null when the pipeline had no history to read. */
  readonly regionHistory: DistrictRegionHistory | null
  /** Why the history is null, when the caller knows better than "absent". */
  readonly regionHistoryNote?: string
  readonly generatedAt?: string
}

export interface RegionRollupsResult {
  readonly rollups: RegionRollups
  /** Rankings districts with no district file: the writer must refuse. */
  readonly missingDistricts: string[]
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

const STATUS_KEYS = ['active', 'low', 'ineligible', 'suspended'] as const

/** A club's figures as a one-club block, before presence is applied. */
interface ClubFacts {
  readonly club: RegionRollupClub
  readonly charteredInWindow: boolean
  readonly suspendedInWindow: boolean
  readonly hasCharterDate: boolean
  readonly hasSuspendDate: boolean
}

function emptyFigures(): RegionRollupFigures {
  return {
    clubs: 0,
    membership: 0,
    payments: 0,
    health: { thriving: 0, vulnerable: 0, interventionRequired: 0 },
    clubStatus: { active: 0, low: 0, ineligible: 0, suspended: 0, other: 0 },
    distinguished: {
      smedley: 0,
      president: 0,
      select: 0,
      distinguished: 0,
      notDistinguished: 0,
    },
    compliance: {
      cspSubmitted: 0,
      octoberDuesOnTime: 0,
      aprilDuesOnTime: 0,
      officerListOnTime: 0,
    },
    growth: { prospective: 0, chartered: 0, suspended: 0 },
    officerTraining: emptyDistribution(),
  }
}

function emptyDistribution(): OfficerTrainingDistribution {
  const zeros = (): number[] =>
    new Array<number>(OFFICER_TRAINING_MAX_OFFICERS + 1).fill(0)
  return { round1: zeros(), round2: zeros() }
}

/** Index-by-index sum; null (or a pre-#2296 absent block) on either side
 *  makes the sum null. */
function addDistribution(
  a: OfficerTrainingDistribution | null | undefined,
  b: OfficerTrainingDistribution | null | undefined
): OfficerTrainingDistribution | null {
  if (!a || !b) return null
  return {
    round1: a.round1.map((n, i) => n + (b.round1[i] ?? 0)),
    round2: a.round2.map((n, i) => n + (b.round2[i] ?? 0)),
  }
}

const addMaybe = (a: number | null, b: number | null): number | null =>
  a === null || b === null ? null : a + b

/** Figure-by-figure sum; a null in either side makes that figure null. */
function addFigures(
  a: RegionRollupFigures,
  b: RegionRollupFigures
): RegionRollupFigures {
  return {
    clubs: a.clubs + b.clubs,
    membership: a.membership + b.membership,
    payments: a.payments + b.payments,
    health: {
      thriving: a.health.thriving + b.health.thriving,
      vulnerable: a.health.vulnerable + b.health.vulnerable,
      interventionRequired:
        a.health.interventionRequired + b.health.interventionRequired,
    },
    clubStatus: {
      active: a.clubStatus.active + b.clubStatus.active,
      low: a.clubStatus.low + b.clubStatus.low,
      ineligible: a.clubStatus.ineligible + b.clubStatus.ineligible,
      suspended: a.clubStatus.suspended + b.clubStatus.suspended,
      other: a.clubStatus.other + b.clubStatus.other,
    },
    distinguished: {
      smedley: addMaybe(a.distinguished.smedley, b.distinguished.smedley),
      president: a.distinguished.president + b.distinguished.president,
      select: a.distinguished.select + b.distinguished.select,
      distinguished:
        a.distinguished.distinguished + b.distinguished.distinguished,
      notDistinguished:
        a.distinguished.notDistinguished + b.distinguished.notDistinguished,
    },
    compliance: {
      cspSubmitted: addMaybe(
        a.compliance.cspSubmitted,
        b.compliance.cspSubmitted
      ),
      octoberDuesOnTime: addMaybe(
        a.compliance.octoberDuesOnTime,
        b.compliance.octoberDuesOnTime
      ),
      aprilDuesOnTime: addMaybe(
        a.compliance.aprilDuesOnTime,
        b.compliance.aprilDuesOnTime
      ),
      officerListOnTime: addMaybe(
        a.compliance.officerListOnTime,
        b.compliance.officerListOnTime
      ),
    },
    growth: {
      prospective: addMaybe(a.growth.prospective, b.growth.prospective),
      chartered: addMaybe(a.growth.chartered, b.growth.chartered),
      suspended: addMaybe(a.growth.suspended, b.growth.suspended),
    },
    officerTraining: addDistribution(a.officerTraining, b.officerTraining),
  }
}

interface DateContext {
  readonly month: number
  readonly programYear: string
  readonly smedley: boolean
  /** Date-wide: some in-scope club carries a parseable charter date. */
  readonly charterCollected: boolean
  /** Date-wide: some in-scope club carries a parseable suspension date. */
  readonly suspendCollected: boolean
}

/** The fields {@link classifyRollupClub} reads. */
export type RollupClassifiedClub = Pick<
  RegionRollupClub,
  'membershipCount' | 'membershipBase' | 'dcpGoals' | 'cspSubmitted'
>

/**
 * A club's health (#1120) and distinguished level (CSP-gated, the program
 * year's own ladder, #1406), as the district club-health analytics classify
 * a snapshot's clubs. Shared by the region rollups and the per-region club
 * shards (#1800) so a shard's pins and its region's counts cannot disagree.
 */
export function classifyRollupClub(
  club: RollupClassifiedClub,
  month: number,
  programYear: string
): { health: ClubHealthStatus; level: DistinguishedLevel } {
  // Net growth = active members − membership base, as calculateNetGrowth.
  const netGrowth = club.membershipCount - club.membershipBase
  const cspSubmitted = getCSPStatus(club)
  const { status } = classifyClubHealth(
    {
      membership: club.membershipCount,
      netGrowth,
      dcpGoals: club.dcpGoals,
      cspSubmitted,
    },
    month
  )
  const level = cspSubmitted
    ? determineDistinguishedLevel(
        club.dcpGoals,
        club.membershipCount,
        netGrowth,
        programYear
      )
    : 'NotDistinguished'
  return { health: status, level }
}

/** One district's figures from its (deduplicated) clubs. */
function districtFigures(
  facts: readonly ClubFacts[],
  prospectiveClubs: number | null,
  ctx: DateContext
): RegionRollupFigures {
  const f = emptyFigures()
  const has = (key: keyof RegionRollupClub): boolean =>
    facts.some(({ club }) => typeof club[key] === 'boolean')
  const count = (key: keyof RegionRollupClub): number =>
    facts.filter(({ club }) => club[key] === true).length

  for (const { club, charteredInWindow, suspendedInWindow } of facts) {
    f.clubs += 1
    f.membership += club.membershipCount
    f.payments += club.paymentsCount

    const { health: status, level } = classifyRollupClub(
      club,
      ctx.month,
      ctx.programYear
    )
    if (status === 'thriving') f.health.thriving += 1
    else if (status === 'vulnerable') f.health.vulnerable += 1
    else f.health.interventionRequired += 1

    const clubStatus = (club.clubStatus ?? '').trim().toLowerCase()
    const statusKey = STATUS_KEYS.find(k => k === clubStatus)
    if (statusKey) f.clubStatus[statusKey] += 1
    else f.clubStatus.other += 1

    if (level === 'Smedley')
      f.distinguished.smedley = (f.distinguished.smedley ?? 0) + 1
    else if (level === 'President') f.distinguished.president += 1
    else if (level === 'Select') f.distinguished.select += 1
    else if (level === 'Distinguished') f.distinguished.distinguished += 1
    else f.distinguished.notDistinguished += 1

    if (charteredInWindow) f.growth.chartered = (f.growth.chartered ?? 0) + 1
    if (suspendedInWindow) f.growth.suspended = (f.growth.suspended ?? 0) + 1
  }

  if (!ctx.smedley) f.distinguished.smedley = null
  f.compliance = {
    cspSubmitted: has('cspSubmitted') ? count('cspSubmitted') : null,
    octoberDuesOnTime: has('octoberDuesOnTime')
      ? count('octoberDuesOnTime')
      : null,
    aprilDuesOnTime: has('aprilDuesOnTime') ? count('aprilDuesOnTime') : null,
    officerListOnTime: has('officerListOnTime')
      ? count('officerListOnTime')
      : null,
  }
  // Officers trained per round (#2296): clubs whose row carries the cell;
  // null when no club in the district does (the column was not collected).
  const trained = facts.filter(
    ({ club }) =>
      club.officersTrainedRound1 !== undefined ||
      club.officersTrainedRound2 !== undefined
  )
  if (trained.length === 0) {
    f.officerTraining = null
  } else {
    const distribution = emptyDistribution()
    for (const { club } of trained) {
      if (club.officersTrainedRound1 !== undefined)
        distribution.round1[club.officersTrainedRound1]! += 1
      if (club.officersTrainedRound2 !== undefined)
        distribution.round2[club.officersTrainedRound2]! += 1
    }
    f.officerTraining = distribution
  }
  f.growth.prospective = prospectiveClubs
  if (!ctx.charterCollected) f.growth.chartered = null
  if (!ctx.suspendCollected) f.growth.suspended = null
  return f
}

/** The history's district entry for `districtId`, on the canonical key. */
function historyLookup(
  history: DistrictRegionHistory
): (districtId: string) => DistrictRegionHistory['districts'][string] | null {
  const byKey = new Map(
    Object.entries(history.districts).map(([id, entry]) => [
      canonicalDistrictId(id),
      entry,
    ])
  )
  return id => byKey.get(canonicalDistrictId(id)) ?? null
}

export interface RegionMembershipResolution {
  /** A district's region for the program year; null when none usable. */
  readonly regionOf: ((districtId: string) => string | null) | null
  /** Why there is no membership; null when there is. */
  readonly note: string | null
  readonly membership: {
    source: typeof REGION_ROLLUPS_REGION_SOURCE
    asOf: string
    programYear: string
  } | null
}

/**
 * Region membership for one program year from the district → region
 * history (#1820), or the reason there is none. Shared by the region
 * rollups (#1799), the per-region club shards (#1800) and the region
 * membership series (#2127), so all three place every district in the same
 * region for the same program year.
 */
export function resolveRegionMembership(
  history: DistrictRegionHistory | null,
  programYear: string,
  historyNote?: string
): RegionMembershipResolution {
  if (!history) {
    return {
      regionOf: null,
      note:
        historyNote ??
        `no ${REGION_ROLLUPS_REGION_SOURCE} was available to this run; region membership is unknown`,
      membership: null,
    }
  }
  if (!history.programYears.includes(programYear)) {
    return {
      regionOf: null,
      note: `${REGION_ROLLUPS_REGION_SOURCE} (asOf ${history.asOf}) has no ${programYear} membership yet`,
      membership: null,
    }
  }
  const lookup = historyLookup(history)
  return {
    regionOf: id => lookup(id)?.byProgramYear[programYear] ?? null,
    note: null,
    membership: {
      source: REGION_ROLLUPS_REGION_SOURCE,
      asOf: history.asOf,
      programYear,
    },
  }
}

function withoutRegion(row: RegionRollupDistrict): RegionRollupFigures {
  const figures: Partial<RegionRollupDistrict> = { ...row }
  delete figures.region
  return figures as RegionRollupFigures
}

export function buildRegionRollups(
  input: RegionRollupsInput
): RegionRollupsResult {
  const { snapshotDate } = input
  const programYear = programYearForSnapshotDate(snapshotDate)

  const scope = new Set(
    input.rankings.map(r => canonicalDistrictId(r.districtId))
  )
  const sorted = [...input.districts].sort((a, b) =>
    byString(a.districtId, b.districtId)
  )

  const start = getProgramYearStartDate(snapshotDate)
  const end = parseDateFlexible(snapshotDate)
  if (!start || !end) {
    throw new Error(`buildRegionRollups: not a date: ${snapshotDate}`)
  }
  const inWindow = (d: Date | null): boolean =>
    d !== null && d.getTime() >= start.getTime() && d.getTime() <= end.getTime()

  // The one merged entity set: in-scope districts, clubs deduplicated.
  const excludedDistricts: string[] = []
  const seenDistricts = new Set<string>()
  const clubHome = new Map<string, string[]>()
  const perDistrict: Array<{
    districtId: string
    facts: ClubFacts[]
    prospectiveClubs: number | null
  }> = []
  for (const district of sorted) {
    const key = canonicalDistrictId(district.districtId)
    if (!scope.has(key) || seenDistricts.has(key)) {
      excludedDistricts.push(district.districtId)
      continue
    }
    seenDistricts.add(key)
    const facts: ClubFacts[] = []
    for (const club of district.clubs) {
      const clubId = normalizeClubId(club.clubId)
      const home = clubHome.get(clubId)
      if (home) {
        home.push(district.districtId)
        continue
      }
      clubHome.set(clubId, [district.districtId])
      const charter = parseCharterDateFromStatusField(club.charterSuspendField)
      const suspend = parseSuspendDateFromStatusField(club.charterSuspendField)
      facts.push({
        club,
        charteredInWindow: inWindow(charter),
        suspendedInWindow: inWindow(suspend),
        hasCharterDate: charter !== null,
        hasSuspendDate: suspend !== null,
      })
    }
    perDistrict.push({
      districtId: district.districtId,
      facts,
      prospectiveClubs: district.prospectiveClubs,
    })
  }

  const missingDistricts = input.rankings
    .map(r => r.districtId)
    .filter(id => !seenDistricts.has(canonicalDistrictId(id)))

  const allFacts = perDistrict.flatMap(d => d.facts)
  const ctx: DateContext = {
    month: getCurrentProgramMonth(snapshotDate),
    programYear,
    smedley: isClubSmedleyAvailable(programYear),
    charterCollected: allFacts.some(f => f.hasCharterDate),
    suspendCollected: allFacts.some(f => f.hasSuspendDate),
  }

  // Region membership for this program year, or the reason there is none.
  const {
    regionOf,
    note: regionNote,
    membership,
  } = resolveRegionMembership(
    input.regionHistory,
    programYear,
    input.regionHistoryNote
  )

  const districts: Record<string, RegionRollupDistrict> = {}
  const regionMembers = new Map<string, string[]>()
  const unassignedDistricts: string[] = []
  let world = emptyFigures()
  for (const d of perDistrict) {
    const figures = districtFigures(d.facts, d.prospectiveClubs, ctx)
    const region = regionOf ? regionOf(d.districtId) : null
    districts[d.districtId] = { region, ...figures }
    world = addFigures(world, figures)
    if (!regionOf) continue
    if (region === null) unassignedDistricts.push(d.districtId)
    else
      regionMembers.set(region, [
        ...(regionMembers.get(region) ?? []),
        d.districtId,
      ])
  }
  if (perDistrict.length === 0) {
    world.compliance = {
      cspSubmitted: null,
      octoberDuesOnTime: null,
      aprilDuesOnTime: null,
      officerListOnTime: null,
    }
    world.growth = { prospective: null, chartered: null, suspended: null }
    world.officerTraining = null
    if (!ctx.smedley) world.distinguished.smedley = null
  }

  let regions: Record<string, RegionRollupRegion> | null = null
  if (regionOf) {
    regions = {}
    for (const region of [...regionMembers.keys()].sort(byString)) {
      const ids = regionMembers.get(region)!
      const sum = ids
        .map(id => withoutRegion(districts[id]!))
        .reduce(addFigures)
      regions[region] = { districtIds: ids, ...sum }
    }
  }

  const duplicateClubs = [...clubHome]
    .filter(([, homes]) => homes.length > 1)
    .map(([clubId, districtIds]) => ({ clubId, districtIds }))
    .sort((a, b) => byString(a.clubId, b.clubId))

  return {
    rollups: {
      _format: REGION_ROLLUPS_FORMAT,
      snapshotDate,
      programYear,
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      regionMembership: membership,
      regionMembershipNote: regionNote,
      scope: { excludedDistricts, unassignedDistricts, duplicateClubs },
      world: { districts: perDistrict.length, ...world },
      regions,
      districts,
    },
    missingDistricts,
  }
}

// ---------------------------------------------------------------------------
// Filesystem door
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

const num = (value: unknown): number => Number(value ?? 0) || 0

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
