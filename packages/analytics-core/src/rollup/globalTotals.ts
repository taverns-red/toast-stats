/**
 * `snapshots/{date}/global-totals.json` — the worldwide scoreboard for one
 * snapshot date (#1498, epic #1496, ruled on #1426).
 *
 * The rule this module exists to hold: **every club-level number goes through
 * `rollUpGlobal`**, scoped to the ids the date's own `all-districts-rankings`
 * lists and keyed on the canonical club id, and every district-level number
 * is a sum over those same rankings rows. Nothing here reads a directory
 * listing, and nothing mixes the two surfaces that use the same tier names
 * for different things (rankings = or-better + subsets; `district_{id}.json`
 * `totals` = disjoint per-tier, #1124).
 *
 * Three "absent is not zero" rules live here rather than at the writer,
 * because the writer is the last place they can be quietly lost:
 *
 * 1. Smedley is `null` before program year 2025-2026 — the tier did not
 *    exist, even though the archived rankings store a literal 0 back to 2022.
 * 2. A district whose verdict is `Unknown` is its own bucket, never a
 *    failure (#1116 item 5).
 * 3. Clubs Find-A-Club never matched to a country are published as an
 *    explicit `unknown` residual, never dropped (epic finding F2).
 *
 * Pure: this module reads no files. `readGlobalTotalsInput` in
 * `./globalRollup.js` is the only filesystem door.
 *
 * @module @taverns-red/analytics-core/rollup
 */

import {
  GLOBAL_TOTALS_FORMAT,
  type DistrictRanking,
  type GlobalTotals,
  type GlobalTotalsDistrictTiers,
} from '@taverns-red/shared-contracts'
import {
  DistinguishedDistrictCalculator,
  type DistinguishedDistrictTier,
} from '../rankings/DistinguishedDistrictCalculator.js'
import { isClubSmedleyAvailable } from '../analytics/ClubEligibilityUtils.js'
import { rollUpGlobal, type DistrictClubPayments } from './globalRollup.js'

export interface GlobalTotalsInput {
  /** The snapshot's own date (YYYY-MM-DD) — the key for every window. */
  readonly snapshotDate: string
  /** Every district file found in the snapshot directory. */
  readonly districts: readonly DistrictClubPayments[]
  /** The date's own `all-districts-rankings.json` rows — the district set. */
  readonly rankings: readonly DistrictRanking[]
  /** ISO timestamp to stamp; defaults to now. Injected so tests can freeze it. */
  readonly generatedAt?: string
}

/**
 * The program year a snapshot date belongs to (July 1 → June 30), keyed on
 * the SNAPSHOT DATE and never on `metadata.sourceCsvDate`: a year-end
 * snapshot's source date falls in July, which lands one era late (Lesson 139).
 */
export function programYearForSnapshotDate(snapshotDate: string): string {
  const year = Number.parseInt(snapshotDate.slice(0, 4), 10)
  const month = Number.parseInt(snapshotDate.slice(5, 7), 10)
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

/** The undistricted bucket's ranking id — a row, but not a district. */
const UNDISTRICTED_ID = 'U'

const isUndistricted = (row: DistrictRanking): boolean =>
  row.districtId.trim().toUpperCase() === UNDISTRICTED_ID

const DISTINGUISHED_OR_BETTER: readonly DistinguishedDistrictTier[] = [
  'Distinguished',
  'Select',
  'Presidents',
  'Smedley',
]

const sumField = (
  rankings: readonly DistrictRanking[],
  field: keyof DistrictRanking
): number =>
  rankings.reduce((sum, row) => sum + (Number(row[field] ?? 0) || 0), 0)

/** `numerator / denominator`, or null rather than a divide-by-zero. */
const ratio = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator

/**
 * The base rung, by subtraction: or-better minus the three named rungs above
 * it (Smedley contributing 0 in the years it did not exist).
 *
 * THROWS on a negative result rather than publishing one. A negative base can
 * only mean the subtrahends are not subsets of `distinguishedClubs` — i.e.
 * that this rankings file's `distinguishedClubs` is a per-tier count, the
 * disjoint semantics `district_{id}.json` `totals` uses (#1124). That is the
 * exact surface confusion this artifact is built to avoid, and it would be
 * invisible in the output: a plausible negative, or a wrong positive on some
 * other date. Fail loudly at the one place the contradiction is detectable.
 */
function derivedBaseTier(
  distinguishedOrBetter: number,
  select: number,
  presidents: number,
  smedley: number | null
): number {
  const base = distinguishedOrBetter - select - presidents - (smedley ?? 0)
  if (base < 0) {
    throw new Error(
      `derived base tier is negative (${base}): distinguishedClubs ` +
        `(${distinguishedOrBetter}) is smaller than its own subsets ` +
        `(select ${select} + presidents ${presidents} + smedley ${smedley ?? 0}). ` +
        'The rankings surface treats distinguishedClubs as ' +
        'distinguished-OR-BETTER; a smaller value means this file uses the ' +
        'disjoint per-tier semantics instead (#1124) and must not be summed ' +
        'as if it did not.'
    )
  }
  return base
}

export function buildGlobalTotals(input: GlobalTotalsInput): GlobalTotals {
  const { snapshotDate, rankings } = input
  const programYear = programYearForSnapshotDate(snapshotDate)

  // Everything club-level goes through the one scoped, deduplicating pass.
  // Its refusal on an empty district set (#1465/#1466, R17) is this function's
  // refusal too — an unscoped worldwide number is never guessed at.
  const rollup = rollUpGlobal({
    districts: input.districts,
    rankingsDistrictIds: rankings.map(row => row.districtId),
    snapshotDate,
  })

  const paidClubs = sumField(rankings, 'paidClubs')

  // Rankings tier fields: `distinguishedClubs` is distinguished-OR-BETTER and
  // the other three are subsets of it (#1124, epic F4). Summing the disjoint
  // `district_{id}.json` `totals.*` instead yields a plausible wrong number.
  const distinguishedOrBetter = sumField(rankings, 'distinguishedClubs')
  const select = sumField(rankings, 'selectDistinguished')
  const presidents = sumField(rankings, 'presidentsDistinguished')
  // Absent, not 0, on two different grounds:
  //   · the rung did not exist before PY 2025-26 (archived rankings store a
  //     literal 0 back to 2022, which must not be echoed), and
  //   · an era that HAS the rung but whose rows carry no such field tells us
  //     nothing, and summing absent fields to 0 would assert that it did.
  const smedley =
    isClubSmedleyAvailable(programYear) &&
    rankings.some(row => row.smedleyDistinguished !== undefined)
      ? sumField(rankings, 'smedleyDistinguished')
      : null

  // Districts only. The undistricted `U` row is a bucket of clubs that belong
  // to no district — it cannot earn Distinguished District recognition, and
  // scoring it would put a second district basis in the artifact: `byTier`
  // summing to 128 while `districts.numbered` said 127. Excluding it keeps
  // the two consistent, and it is the only row excluded — lettered districts
  // such as `F` are districts and are scored.
  const scorableDistricts = rankings.filter(row => !isUndistricted(row))
  const statuses = new DistinguishedDistrictCalculator().calculateAll(
    // `programYear` is ALWAYS passed. Omitting it falls back to the CURRENT
    // ruleset, which scores a historical year under rules whose prerequisite
    // columns its export never carried — flipping every district to Unknown.
    scorableDistricts as DistrictRanking[],
    programYear
  )
  const byTier: GlobalTotalsDistrictTiers = {
    Distinguished: 0,
    Select: 0,
    Presidents: 0,
    Smedley: 0,
    NotDistinguished: 0,
    Unknown: 0,
  }
  const undefinedVerdictDistricts: string[] = []
  for (const status of Object.values(statuses)) {
    byTier[status.currentTier] += 1
    if (status.currentTier === 'Unknown') {
      undefinedVerdictDistricts.push(status.districtId)
    }
  }
  const distinguishedDistricts = DISTINGUISHED_OR_BETTER.reduce(
    (sum, tier) => sum + byTier[tier],
    0
  )

  const includesUndistricted = rankings.some(isUndistricted)

  return {
    _format: GLOBAL_TOTALS_FORMAT,
    date: snapshotDate,
    programYear,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    districts: {
      total: rankings.length,
      numbered: rankings.length - (includesUndistricted ? 1 : 0),
      includesUndistricted,
      excludedDistricts: [...rollup.excludedDistricts],
      missingDistricts: [...rollup.missingDistricts],
      duplicateClubs: rollup.duplicateClubs.map(duplicate => ({
        clubId: duplicate.clubId,
        districtIds: [...duplicate.districtIds],
      })),
    },
    membership: {
      totalMembership: rollup.totalMembership,
      totalPayments: rollup.totalPayments,
      paidClubs,
      activeClubs: sumField(rankings, 'activeClubs'),
      clubsCounted: rollup.clubCount,
      avgClubSize: ratio(rollup.totalMembership, paidClubs),
    },
    distinguishedClubs: {
      distinguishedOrBetter,
      select,
      presidents,
      smedley,
      base: derivedBaseTier(distinguishedOrBetter, select, presidents, smedley),
      percentOfPaidClubs: ratio(distinguishedOrBetter * 100, paidClubs),
    },
    distinguishedDistricts: {
      distinguishedOrBetter: distinguishedDistricts,
      byTier,
      undefinedVerdictDistricts,
    },
    clubMovement: {
      newClubsStillActive: rollup.newClubsStillActive,
      suspendedClubs: rollup.suspendedClubs,
    },
    clubsByCountry: {
      countries: rollup.clubsByCountry.map(row => ({ ...row })),
      unknown: rollup.clubsWithUnknownCountry,
    },
  }
}
