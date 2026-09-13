/**
 * `snapshots/{date}/global-club-race.json` — the worldwide race to
 * Distinguished for one snapshot date (#1556, spec
 * `docs/specs/global-club-rankings.md` §3.3).
 *
 * A projection: the crossing store (`club-race/{PY}/first-reached.json`,
 * written daily by the collector) joined with the date's own district files.
 * The store is the source of truth for every `reachedOn`; this module adds
 * ranks, windows, today's standing, histograms and district shares — and
 * invents no rule of its own:
 *
 * - The tier a club holds today is `determineDistinguishedLevelAtSnapshot`
 *   (ruling R-A basis); the active-members reading beside it is
 *   `determineDistinguishedLevel` — both the existing ladder.
 * - The district set is the date's own `all-districts-rankings.json`, never
 *   a directory listing (#1465); files outside it are reported, not summed.
 * - Ranks are competition ranks by `reachedOn` (1, 1, 1, 4): a tie on the
 *   first observed date is honest, and no tie-break invents an order the
 *   data does not carry.
 * - `reached` holds only clubs that crossed a line or carry TI's official
 *   code. Everything about the rest is a histogram, so a club page can place
 *   itself in a cohort without any global list having a bottom (spec §6).
 *
 * Pure: reads no files. The collector supplies district clubs and the store.
 *
 * @module @taverns-red/analytics-core/rollup
 */

import {
  GLOBAL_CLUB_RACE_FORMAT,
  CLUB_RACE_TIERS,
  type ClubRaceStoreData,
  type ClubRaceTier,
  type DistrictRanking,
  type GlobalClubRace,
  type GlobalClubRaceCurrent,
  type GlobalClubRaceDistribution,
  type GlobalClubRaceDistrict,
  type GlobalClubRaceLevel,
  type GlobalClubRaceMembershipBands,
  type GlobalClubRaceObservation,
  type GlobalClubRaceReached,
  type GlobalClubRaceTimelinePoint,
} from '@taverns-red/shared-contracts'
import type { ClubStatistics } from '../interfaces.js'
import {
  classifyDistinguishedTier,
  clubTiersForProgramYear,
  determineDistinguishedLevel,
  determineDistinguishedLevelAtSnapshot,
  distinguishedMembershipBasis,
  getCSPStatus,
  isClubSmedleyAvailable,
  isCspRequired,
} from '../analytics/ClubEligibilityUtils.js'
import { canonicalDistrictId } from './globalRollup.js'
import { programYearForSnapshotDate } from './globalTotals.js'
import { normalizeClubId } from '@taverns-red/shared-contracts'

/** One district file's clubs — `district_{id}.json` `data.clubs`. */
export interface GlobalClubRaceDistrictInput {
  readonly districtId: string
  readonly clubs: readonly ClubStatistics[]
}

export interface GlobalClubRaceInput {
  /** The snapshot's own date (YYYY-MM-DD). */
  readonly snapshotDate: string
  /** The date's own `all-districts-rankings.json` rows — the district set. */
  readonly rankings: readonly DistrictRanking[]
  /** Every district file found for the date. */
  readonly districts: readonly GlobalClubRaceDistrictInput[]
  /** The program year's crossing store, already folded for this date. */
  readonly store: ClubRaceStoreData
  /** ISO timestamp to stamp; defaults to now. Injected so tests can freeze it. */
  readonly generatedAt?: string
}

const UNDISTRICTED_ID = 'U'
const isUndistricted = (districtId: string): boolean =>
  canonicalDistrictId(districtId) === UNDISTRICTED_ID

type PerTier<T> = Record<ClubRaceTier, T>
const perTier = <T>(make: () => T): PerTier<T> => ({
  Distinguished: make(),
  Select: make(),
  President: make(),
  Smedley: make(),
})

type MembershipBand = keyof GlobalClubRaceMembershipBands
function membershipBand(members: number): MembershipBand {
  if (members < 12) return 'lt12'
  if (members < 20) return 'from12to19'
  if (members < 25) return 'from20to24'
  return 'ge25'
}

const emptyHistogram = (): number[] => Array.from({ length: 11 }, () => 0)

/** Goals-met index, clamped into the 0…10 buckets. */
const goalsBucket = (goals: number): number =>
  Math.min(10, Math.max(0, Math.trunc(goals)))

/** Days between two ISO dates (UTC midnight to UTC midnight). */
const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

function observationFor(
  observedDates: readonly string[],
  snapshotDate: string
): GlobalClubRaceObservation {
  const sorted = [...observedDates].sort()
  let previous: string | null = null
  for (const d of sorted) {
    if (d >= snapshotDate) break
    previous = d
  }
  const gaps = sorted
    .slice(1)
    .map((d, i) => daysBetween(sorted[i]!, d))
    .sort((a, b) => a - b)
  let resolution: GlobalClubRaceObservation['resolution'] = 'unknown'
  if (gaps.length > 0) {
    const median =
      gaps.length % 2 === 1
        ? gaps[(gaps.length - 1) / 2]!
        : (gaps[gaps.length / 2 - 1]! + gaps[gaps.length / 2]!) / 2
    resolution = median <= 2 ? 'daily' : median >= 25 ? 'monthly' : 'mixed'
  }
  return {
    firstObservedDate: sorted[0] ?? null,
    previousSnapshotDate: previous,
    observedDates: sorted.length,
    resolution,
  }
}

function timelineFor(store: ClubRaceStoreData): GlobalClubRaceTimelinePoint[] {
  const entries = Object.values(store.clubs)
  return [...store.observedDates].sort().map(date => {
    const point: GlobalClubRaceTimelinePoint = {
      date,
      Distinguished: 0,
      Select: 0,
      President: 0,
      Smedley: 0,
      official: 0,
    }
    for (const entry of entries) {
      for (const tier of CLUB_RACE_TIERS) {
        const crossing = entry.reached[tier]
        if (crossing && crossing.on <= date) point[tier] += 1
      }
      if (entry.official && entry.official.on <= date) point.official += 1
    }
    return point
  })
}

/**
 * Competition ranks by `reachedOn` within a tier: rank = 1 + the number of
 * clubs that reached strictly earlier. Ties share; the next rank skips.
 */
function ranksFor(
  store: ClubRaceStoreData,
  tier: ClubRaceTier
): Map<string, number> {
  const dated = Object.values(store.clubs)
    .flatMap(entry => {
      const crossing = entry.reached[tier]
      return crossing ? [{ clubId: entry.clubId, on: crossing.on }] : []
    })
    .sort((a, b) => a.on.localeCompare(b.on))
  const ranks = new Map<string, number>()
  for (const row of dated) {
    const firstWithSameDate = dated.findIndex(other => other.on === row.on)
    ranks.set(row.clubId, firstWithSameDate + 1)
  }
  return ranks
}

function currentFor(
  club: ClubStatistics,
  snapshotDate: string,
  programYear: string
): GlobalClubRaceCurrent {
  const netGrowth = club.membershipCount - club.membershipBase
  const cspSubmitted = getCSPStatus(club)
  const activeMembersLevel: GlobalClubRaceLevel = cspSubmitted
    ? determineDistinguishedLevel(
        club.dcpGoals,
        club.membershipCount,
        netGrowth,
        programYear
      )
    : 'NotDistinguished'
  const goals = club.dcpGoalsAchieved
  return {
    level: determineDistinguishedLevelAtSnapshot(
      club,
      snapshotDate,
      programYear
    ),
    activeMembersLevel,
    goalsMet: club.dcpGoals,
    members: club.membershipCount,
    membershipBase: club.membershipBase,
    netGrowth,
    aprilRenewals: club.aprilRenewals,
    cspSubmitted,
    // Ten INDEPENDENT goals, verbatim — never derived from the count.
    dcpGoalsAchieved:
      Array.isArray(goals) && goals.length === 10 ? [...goals] : null,
    divisionId: club.divisionId,
    areaId: club.areaId,
    country: club.address?.country?.trim() || null,
  }
}

export function buildGlobalClubRace(
  input: GlobalClubRaceInput
): GlobalClubRace {
  const { snapshotDate, rankings, store } = input
  const programYear = programYearForSnapshotDate(snapshotDate)
  if (store.programYear !== programYear) {
    throw new Error(
      `club-race store is for ${store.programYear} but ${snapshotDate} ` +
        `belongs to ${programYear} — refusing to project one year's ` +
        'crossings onto another'
    )
  }

  // ── Scope: the date's own district set, never the directory ────────────
  const inScope = new Map<string, DistrictRanking>()
  for (const row of rankings)
    inScope.set(canonicalDistrictId(row.districtId), row)

  const excludedDistricts: string[] = []
  const filesByDistrict = new Map<string, readonly ClubStatistics[]>()
  for (const district of input.districts) {
    const key = canonicalDistrictId(district.districtId)
    if (!inScope.has(key)) {
      excludedDistricts.push(district.districtId)
      continue
    }
    filesByDistrict.set(key, district.clubs)
  }
  const missingDistricts = rankings
    .filter(row => !filesByDistrict.has(canonicalDistrictId(row.districtId)))
    .map(row => row.districtId)

  // ── Today's clubs, keyed on the canonical id ────────────────────────────
  const today = new Map<string, GlobalClubRaceCurrent>()
  const clubsPerDistrict = new Map<string, number>()
  const distribution: GlobalClubRaceDistribution = {
    goalsMet: emptyHistogram(),
    membership: { lt12: 0, from12to19: 0, from20to24: 0, ge25: 0 },
    byTierRequirementsMet: {
      none: 0,
      Distinguished: 0,
      Select: 0,
      President: 0,
      Smedley: 0,
    },
    byOfficialCode: { none: 0, D: 0, S: 0, P: 0, M: 0 },
    cohorts: {
      lt12: emptyHistogram(),
      from12to19: emptyHistogram(),
      from20to24: emptyHistogram(),
      ge25: emptyHistogram(),
    },
  }
  for (const [districtKey, clubs] of filesByDistrict) {
    let counted = 0
    for (const club of clubs) {
      const clubId = normalizeClubId(club.clubId)
      if (clubId === '') continue
      counted += 1
      const current = currentFor(club, snapshotDate, programYear)
      today.set(clubId, current)

      const bucket = goalsBucket(current.goalsMet)
      const band = membershipBand(current.members)
      distribution.goalsMet[bucket]! += 1
      distribution.membership[band] += 1
      distribution.cohorts[band][bucket]! += 1
      if (current.level === 'NotDistinguished') {
        distribution.byTierRequirementsMet.none += 1
      } else {
        distribution.byTierRequirementsMet[current.level] += 1
      }
      const code = classifyDistinguishedTier(club.distinguishedStatus)
      if (code === null) distribution.byOfficialCode.none += 1
      else distribution.byOfficialCode[code] += 1
    }
    clubsPerDistrict.set(districtKey, counted)
  }

  // ── Reached rows from the store, joined with today ──────────────────────
  const ranks = perTier(() => new Map<string, number>())
  for (const tier of CLUB_RACE_TIERS) ranks[tier] = ranksFor(store, tier)

  const reached: GlobalClubRaceReached[] = []
  let reachedAbsentToday = 0
  let officialWithoutDerived = 0
  for (const entry of Object.values(store.clubs)) {
    const hasDerived = CLUB_RACE_TIERS.some(tier => entry.reached[tier])
    if (!hasDerived && !entry.official) continue
    if (!hasDerived) officialWithoutDerived += 1

    const current = today.get(entry.clubId) ?? null
    if (current === null) reachedAbsentToday += 1

    const tiers: GlobalClubRaceReached['tiers'] = {}
    for (const tier of CLUB_RACE_TIERS) {
      const crossing = entry.reached[tier]
      if (!crossing) continue
      tiers[tier] = {
        reachedOn: crossing.on,
        observedAfter: crossing.after,
        rank: ranks[tier].get(entry.clubId)!,
      }
    }
    reached.push({
      clubId: entry.clubId,
      clubName: entry.clubName,
      districtId: entry.districtId,
      current,
      tiers,
      official: entry.official
        ? {
            code: entry.official.code,
            since: entry.official.on,
            observedAfter: entry.official.after,
          }
        : null,
    })
  }
  // Earliest Distinguished crossing first; official-only rows last.
  reached.sort((a, b) => {
    const ad = a.tiers.Distinguished?.reachedOn ?? '9999-99-99'
    const bd = b.tiers.Distinguished?.reachedOn ?? '9999-99-99'
    return ad.localeCompare(bd) || a.clubName.localeCompare(b.clubName)
  })

  // ── District standings, on the paid-club base ───────────────────────────
  const byDistrict: GlobalClubRaceDistrict[] = rankings.map(row => {
    const key = canonicalDistrictId(row.districtId)
    const mine = reached.filter(r => canonicalDistrictId(r.districtId) === key)
    const counts = perTier(() => 0)
    const first = perTier<string | null>(() => null)
    let worldwideFirsts = 0
    for (const r of mine) {
      for (const tier of CLUB_RACE_TIERS) {
        const standing = r.tiers[tier]
        if (!standing) continue
        counts[tier] += 1
        if (first[tier] === null || standing.reachedOn < first[tier]!) {
          first[tier] = standing.reachedOn
        }
        if (standing.rank === 1) worldwideFirsts += 1
      }
    }
    const paidClubBase = Number(row.paidClubBase ?? 0) || 0
    const percentOfBase =
      isUndistricted(row.districtId) || paidClubBase === 0
        ? null
        : Math.min(
            100,
            Math.round((counts.Distinguished / paidClubBase) * 10_000) / 100
          )
    return {
      districtId: row.districtId,
      region: row.region ?? '',
      clubs: clubsPerDistrict.get(key) ?? 0,
      paidClubBase,
      reached: counts,
      percentOfBase,
      firstReachedOn: first,
      worldwideFirsts,
    }
  })

  // ── Ruleset: state the basis rather than let a reader guess it ──────────
  const startYear = Number.parseInt(programYear.slice(0, 4), 10)
  const dataMonth = Number.parseInt(snapshotDate.slice(5, 7), 10)
  const includesUndistricted = rankings.some(row =>
    isUndistricted(row.districtId)
  )

  return {
    _format: GLOBAL_CLUB_RACE_FORMAT,
    date: snapshotDate,
    programYear,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    scope: {
      districts: {
        total: rankings.length,
        numbered: rankings.length - (includesUndistricted ? 1 : 0),
        includesUndistricted,
      },
      clubsScanned: today.size,
      excludedDistricts,
      missingDistricts,
      reachedAbsentToday,
      officialWithoutDerived,
    },
    ruleset: {
      programYear,
      cspRequired: isCspRequired(programYear),
      smedleyAvailable: isClubSmedleyAvailable(programYear),
      membershipBasis: distinguishedMembershipBasis(dataMonth),
      officialRecognitionFrom: `${startYear + 1}-04-01`,
      tiers: clubTiersForProgramYear(programYear).map(tier => ({
        level: tier.level,
        goals: tier.dcpGoals,
        members: tier.members,
        netGrowthAlternative: tier.netGrowthAlternative ?? null,
      })),
    },
    observation: observationFor(store.observedDates, snapshotDate),
    timeline: timelineFor(store),
    distribution,
    reached,
    byDistrict,
  }
}
