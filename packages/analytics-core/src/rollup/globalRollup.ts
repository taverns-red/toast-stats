/**
 * Worldwide rollup — count every club exactly once (#1466, epic #1426).
 *
 * Every artifact this project publishes today is per-district. The CEO Report
 * is global with five years of history, so the rollup IS the build (#1426) —
 * and a rollup that sums a snapshot directory's district files, trusting the
 * directory's own district list, is wrong on at least one real date.
 *
 * `snapshots/2026-06-30/` holds the 128 districts that existed at the 2025-26
 * close PLUS 30 renumbered PY 2026-27 districts a rewrite stamped onto it
 * (#1465). **4,673 clubs appear under two districts there.** A naive sum
 * inflates clubs +31.1%, membership +32.5%, payments +5.0% — and it would not
 * have failed loudly. It would have published a plausible global number that
 * is wrong: the silent-failure shape of #1436-#1443.
 *
 * Two rules, in this order:
 *
 * 1. **Scope to the date's own district set** — the ids
 *    `all-districts-rankings.json` lists for that date, never `readdir()` of
 *    whatever files happen to sit in the directory. This is the rule that
 *    reproduces TI's published figure exactly.
 * 2. **Key on the canonical club id** (`normalizeClubId`, #1440/#1447) inside
 *    that scope, so a club that somehow appears twice is counted once and is
 *    REPORTED. Deduplication alone cannot stand in for rule 1: which of two
 *    rows for one club wins is an artifact of file order, not of truth, so it
 *    can produce a number that is merely different rather than correct. Its
 *    job here is to make contamination visible.
 *
 * A rollup with no district scope is refused outright rather than allowed to
 * emit a plausible number (R17 — the case is stated, not implied).
 *
 * Purity: every computation exported here is pure. `readSnapshotRollupInput`
 * at the bottom is the only function that touches the filesystem.
 *
 * Promoted from `scripts/lib/` into analytics-core by #1498 so the collector
 * pipeline can consume it. ONE canonical module — no second copy.
 *
 * @module @taverns-red/analytics-core/rollup
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  districtIdFromSnapshotFileName,
  isDistrictSnapshotFile,
  normalizeClubId,
} from '@taverns-red/shared-contracts'
import type { DistrictRanking } from '@taverns-red/shared-contracts'
import {
  getProgramYearStartDate,
  parseCharterDateFromStatusField,
  parseDateFlexible,
  parseSuspendDateFromStatusField,
} from '../rankings/programYearDates.js'

/** One club's payment row, as read from a district snapshot. */
export interface ClubPaymentRow {
  /** The club id VERBATIM — normalization happens here, not at the caller. */
  readonly clubId: string
  /** Membership payments to date for the snapshot's program year. */
  readonly payments: number
  /**
   * `clubPerformance`'s "Active Members" for the same club (#1498). Optional
   * because the #1466 payments-only callers predate it; absent counts as 0.
   */
  readonly activeMembers?: number
  /**
   * The raw `Charter Date/Suspend Date` value, VERBATIM (#1498). One column
   * carries both branches — `Charter MM/DD/YY` and (with a leading space)
   * ` Susp MM/DD/YY` — and parsing stays in the rollup, not the reader.
   */
  readonly clubStatusField?: string
  /**
   * Find-A-Club's country for the club, when it matched one (#1498). Absent
   * means unmatched, which is a fact of its own — never folded into a zero.
   */
  readonly country?: string
}

/** One district file's contribution to the rollup. */
export interface DistrictClubPayments {
  readonly districtId: string
  readonly clubs: readonly ClubPaymentRow[]
}

export interface GlobalRollupInput {
  /** Every district file found in the snapshot directory. */
  readonly districts: readonly DistrictClubPayments[]
  /**
   * The district ids the date's `all-districts-rankings.json` lists — the
   * authoritative district set for that date.
   */
  readonly rankingsDistrictIds: readonly string[]
  /**
   * The snapshot's own date (YYYY-MM-DD), which supplies the program-year
   * window charter/suspension counting runs in (#1498). Absent → the
   * movement counts are reported as `null` (unknown), never as 0.
   */
  readonly snapshotDate?: string
}

/** One country's club count in the rollup's breakdown. */
export interface CountryClubCount {
  readonly country: string
  readonly clubs: number
}

/** A club id that resolved to a district outside the date's district set. */
export interface DuplicateClub {
  /** Canonical club id (`normalizeClubId`). */
  readonly clubId: string
  /** Every district the id was seen in, in input order. */
  readonly districtIds: readonly string[]
}

export interface GlobalRollup {
  /** Districts counted — those in scope that had a file. */
  readonly districtCount: number
  /** Distinct canonical club ids counted. */
  readonly clubCount: number
  /** Payments summed over the counted clubs. */
  readonly totalPayments: number
  /**
   * "Active Members" summed over the counted clubs — ALL clubs listed, not
   * only paid or active ones (#1498). At a year-end close suspended clubs
   * still carry rows, so this basis must be stated wherever it is published.
   */
  readonly totalMembership: number
  /**
   * Clubs chartered inside the snapshot date's program year that still have
   * a row at that date. `null` when no `snapshotDate` was supplied — unknown
   * is not zero. NEVER labelled plain "new clubs" (#1426 ruling 5).
   */
  readonly newClubsStillActive: number | null
  /**
   * Clubs suspended inside the snapshot date's program year (#1497).
   * `null` when no `snapshotDate` was supplied.
   */
  readonly suspendedClubs: number | null
  /** Clubs by country, descending, ties broken by country name. */
  readonly clubsByCountry: readonly CountryClubCount[]
  /**
   * Counted clubs Find-A-Club never matched to a country. Reported so the
   * breakdown is always a share of a stated whole (epic #1496 finding F2).
   */
  readonly clubsWithUnknownCountry: number
  /** District files present in the directory but not in the date's set. */
  readonly excludedDistricts: readonly string[]
  /** Districts the date's set lists but no file supplied. */
  readonly missingDistricts: readonly string[]
  /**
   * Clubs that appeared under more than one district within scope. Counted
   * once; reported loudly, because a non-empty list means the directory is
   * contaminated even after scoping.
   */
  readonly duplicateClubs: readonly DuplicateClub[]
}

/**
 * Canonical comparison key for a district id — the config, the CSV and the
 * rankings file disagree on zero-padding and case, and neither difference
 * names a different district.
 */
export function canonicalDistrictId(districtId: string): string {
  const trimmed = districtId.trim().toUpperCase()
  return /^\d+$/.test(trimmed) ? String(parseInt(trimmed, 10)) : trimmed
}

/** Half-open-at-neither-end program-year window, in epoch milliseconds. */
interface ProgramYearWindow {
  readonly startMs: number
  readonly endMs: number
}

/**
 * The program year the SNAPSHOT DATE falls in, as a date window: July 1
 * through the snapshot date itself.
 *
 * The upper bound is the snapshot date, not the following June 30, because a
 * mid-year snapshot must not count a charter or suspension dated after it —
 * and because a year-end directory can legitimately carry rows stamped by a
 * later rewrite (#1465). Keyed on the snapshot date, never on
 * `metadata.sourceCsvDate`, which falls in July for a year-end file and would
 * land the window one program year late (Lesson 139).
 */
function programYearWindow(
  snapshotDate: string | undefined
): ProgramYearWindow | null {
  if (!snapshotDate) return null
  const start = getProgramYearStartDate(snapshotDate)
  const end = parseDateFlexible(snapshotDate)
  if (!start || !end) return null
  return { startMs: start.getTime(), endMs: end.getTime() }
}

function withinWindow(date: Date | null, window: ProgramYearWindow): boolean {
  if (!date) return false
  const ms = date.getTime()
  return ms >= window.startMs && ms <= window.endMs
}

export function rollUpGlobal(input: GlobalRollupInput): GlobalRollup {
  // R17 — an unscoped rollup is refused, never guessed at. Falling back to
  // "every file in the directory" is precisely the bug this module exists to
  // prevent, and it would produce a plausible number rather than an error.
  if (input.rankingsDistrictIds.length === 0) {
    throw new Error(
      'refusing to roll up without the date’s district set: pass the ids ' +
        'all-districts-rankings.json lists for that date (#1466)'
    )
  }

  const scope = new Set(input.rankingsDistrictIds.map(canonicalDistrictId))
  const excludedDistricts: string[] = []
  const seenDistricts = new Set<string>()

  // The program-year window charter/suspension counting runs in. Absent when
  // the caller supplied no snapshot date, in which case both counts stay
  // `null` — unknown, which is not the same fact as zero.
  const window = programYearWindow(input.snapshotDate)

  /** Canonical club id → the districts it was seen in, in input order. */
  const clubDistricts = new Map<string, string[]>()
  const countryCounts = new Map<string, number>()
  let clubCount = 0
  let totalPayments = 0
  let totalMembership = 0
  let newClubsStillActive = 0
  let suspendedClubs = 0
  let clubsWithUnknownCountry = 0

  for (const district of input.districts) {
    const key = canonicalDistrictId(district.districtId)
    if (!scope.has(key)) {
      excludedDistricts.push(district.districtId)
      continue
    }
    seenDistricts.add(key)

    for (const club of district.clubs) {
      const clubId = normalizeClubId(club.clubId)
      const seenIn = clubDistricts.get(clubId)
      if (seenIn) {
        // Counted already. Record where else it appeared and move on — the
        // first row wins, and the duplicate is reported rather than summed.
        seenIn.push(district.districtId)
        continue
      }
      clubDistricts.set(clubId, [district.districtId])
      clubCount += 1
      totalPayments += club.payments
      totalMembership += club.activeMembers ?? 0

      if (window) {
        // One column, two branches. Each parser rejects the other's prefix,
        // so a Susp row can never be counted as a charter (#1497).
        if (
          withinWindow(
            parseCharterDateFromStatusField(club.clubStatusField),
            window
          )
        ) {
          newClubsStillActive += 1
        }
        if (
          withinWindow(
            parseSuspendDateFromStatusField(club.clubStatusField),
            window
          )
        ) {
          suspendedClubs += 1
        }
      }

      const country = club.country?.trim()
      if (country)
        countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1)
      else clubsWithUnknownCountry += 1
    }
  }

  // Descending, ties broken by name so the published order is deterministic.
  const clubsByCountry: CountryClubCount[] = [...countryCounts]
    .map(([country, clubs]) => ({ country, clubs }))
    .sort((a, b) => b.clubs - a.clubs || a.country.localeCompare(b.country))

  const duplicateClubs: DuplicateClub[] = []
  for (const [clubId, districtIds] of clubDistricts) {
    if (districtIds.length > 1) duplicateClubs.push({ clubId, districtIds })
  }

  const missingDistricts = input.rankingsDistrictIds.filter(
    districtId => !seenDistricts.has(canonicalDistrictId(districtId))
  )

  return {
    districtCount: seenDistricts.size,
    clubCount,
    totalPayments,
    totalMembership,
    newClubsStillActive: window ? newClubsStillActive : null,
    suspendedClubs: window ? suspendedClubs : null,
    clubsByCountry,
    clubsWithUnknownCountry,
    excludedDistricts,
    missingDistricts,
    duplicateClubs,
  }
}

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

/** Re-exported so callers use one canonical rule, not a fourth copy. */
export { normalizeClubId }
