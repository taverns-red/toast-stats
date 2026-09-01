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
  // Absent, not 0, before the rung existed — archived files store a literal 0.
  const smedley = isClubSmedleyAvailable(programYear)
    ? sumField(rankings, 'smedleyDistinguished')
    : null

  const statuses = new DistinguishedDistrictCalculator().calculateAll(
    // `programYear` is ALWAYS passed. Omitting it falls back to the CURRENT
    // ruleset, which scores a historical year under rules whose prerequisite
    // columns its export never carried — flipping every district to Unknown.
    rankings as DistrictRanking[],
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

  const includesUndistricted = rankings.some(
    row => row.districtId.trim().toUpperCase() === UNDISTRICTED_ID
  )

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
      base: distinguishedOrBetter - select - presidents - (smedley ?? 0),
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
