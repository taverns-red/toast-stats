/**
 * Per-club historical view-model (#1229, epic #1228).
 *
 * `buildClubHistoryRow` reduces one program year's settled (year-end) club
 * snapshot into a single table row. The data source is the existing parsed
 * `DistrictStatisticsFile.clubs[]` — no pipeline/contract change.
 *
 * Distinguished tier comes from the raw `distinguishedStatus` letter code
 * (`'' | D | S | P | M`), the same authoritative field the "What Changed"
 * surface uses (lesson 123) — never inferred from goal counts. Tier M is
 * Smedley Distinguished (#1226). The code/word-form normalization lives in
 * `distinguishedTier.ts`, beside the canonical code→name map (lesson 117).
 */

import type { ClubStatisticsFile } from '@taverns-red/shared-contracts'
import { getProgramYear } from './programYear'
import { lifecycleDistrictLabel } from './clubLifecycle'
import {
  distinguishedTierName,
  normalizeTierCode,
  type ClubTierCode,
} from './distinguishedTier'

export type { ClubTierCode }

/** Em-dash used for every missing value in the history view. */
export const EM_DASH = '—'

export interface ClubHistoryRow {
  /** Program-year start year (e.g. 2023 for the 2023-2024 program year). */
  startYear: number
  /** Display label, e.g. "2023-2024". */
  label: string
  /** The snapshot date used as this year's settled value. */
  yearEndDate: string
  /** False when the club had no record in this program year's year-end snapshot. */
  hasData: boolean
  /** DCP goals met (0–10), or null when the club is absent. */
  dcpGoals: number | null
  /** Normalized distinguished tier code, or null when absent / no status. */
  tierCode: ClubTierCode | null
  /** Human label for the tier, em-dash when there is none. */
  tierLabel: string
  /** Membership base (program-year start), or null when absent. */
  membershipBase: number | null
  /** Membership at year-end, or null when absent. */
  membershipEnd: number | null
  /** Net membership growth (end − base), or null when absent. */
  membershipNet: number | null
  /** On-time October renewals count, or null when absent. */
  octoberRenewals: number | null
  /** On-time April renewals count, or null when absent. */
  aprilRenewals: number | null
  /** Operational club status (Active / Suspended / Low / Ineligible), or null. */
  clubStatus: string | null
  /**
   * #1803 — the district whose year-end snapshot this row was read from: the
   * district the club was in that program year (club-district history,
   * #1782). Optional so a hand-built row stays valid; `useClubHistory`
   * always sets it.
   */
  districtId?: string
  /**
   * #1803 (Ron, 2026-10-15) — the current program year, read from its latest
   * snapshot so far rather than a year-end: not a settled value.
   */
  inProgress?: boolean
}

/**
 * Reduce one program year's year-end club record into a history row.
 * An absent `club` (the club did not exist / was not reported that year)
 * yields a no-data row rather than throwing — the table renders em-dashes.
 */
export function buildClubHistoryRow(
  startYear: number,
  yearEndDate: string,
  club: ClubStatisticsFile | undefined,
  districtId?: string
): ClubHistoryRow {
  const label = getProgramYear(startYear).label
  const district = districtId === undefined ? {} : { districtId }

  if (!club) {
    return {
      ...district,
      startYear,
      label,
      yearEndDate,
      hasData: false,
      dcpGoals: null,
      tierCode: null,
      tierLabel: EM_DASH,
      membershipBase: null,
      membershipEnd: null,
      membershipNet: null,
      octoberRenewals: null,
      aprilRenewals: null,
      clubStatus: null,
    }
  }

  const tierCode = normalizeTierCode(club.distinguishedStatus)
  const membershipBase = club.membershipBase
  const membershipEnd = club.membershipCount
  const membershipNet =
    membershipBase != null && membershipEnd != null
      ? membershipEnd - membershipBase
      : null

  return {
    ...district,
    startYear,
    label,
    yearEndDate,
    hasData: true,
    dcpGoals: club.dcpGoals,
    tierCode,
    tierLabel: tierCode ? distinguishedTierName(tierCode) : EM_DASH,
    membershipBase,
    membershipEnd,
    membershipNet,
    octoberRenewals: club.octoberRenewals,
    aprilRenewals: club.aprilRenewals,
    clubStatus: club.clubStatus ?? club.status ?? null,
  }
}

/**
 * Why a completed program year produced no row (#1437).
 *
 * These used to be four `return null`s filtered into one empty table, so
 * "this district has no snapshot for that year", "that snapshot failed to
 * load" and "the club is not in this district's snapshot" rendered
 * pixel-for-pixel identically — to the reader AND to anyone debugging. Only
 * one of them means the club has no history.
 */
export type ClubHistorySkipReason =
  /** This district has no snapshot inside that program year at all. */
  | 'district-absent'
  /** The year-end snapshot could not be fetched (missing file, network). */
  | 'snapshot-unavailable'
  /** The snapshot exists but that district's collection failed — no data. */
  | 'snapshot-failed'
  /** The snapshot loaded cleanly; this club is not in it. */
  | 'club-absent'
  /**
   * #1803 — the club-district history has two spans in that program year (it
   * moved during the year) and the year-end district's snapshot lacks it.
   */
  | 'moved-mid-year'

/** One completed program year that yielded no row, and why. */
export interface ClubHistoryGap {
  startYear: number
  /** Display label, e.g. "2023-2024". */
  label: string
  /** The district the lookup was scoped to. */
  districtId: string
  /** The year-end date tried, or null when the district has no date that year. */
  yearEndDate: string | null
  reason: ClubHistorySkipReason
}

/** Beyond this many program years, the list is truncated with a count. */
const MAX_LISTED_YEARS = 6

function listYears(labels: readonly string[]): string {
  if (labels.length <= MAX_LISTED_YEARS) return labels.join(', ')
  return `${labels.slice(0, MAX_LISTED_YEARS).join(', ')} and ${
    labels.length - MAX_LISTED_YEARS
  } more`
}

/**
 * One reader-facing sentence explaining the years that produced no row.
 *
 * The reformation context is the part a reader most needs: a club's history is
 * keyed on its club number, so a club that changed districts still has those
 * years — they are recorded under the district it belonged to at the time, and
 * this district-scoped view cannot reach them.
 *
 * @returns null when nothing was skipped (render the plain empty state).
 */
export function summarizeClubHistoryGaps(
  gaps: readonly ClubHistoryGap[],
  opts: { districtLabel: string; pageDistrictId?: string }
): string | null {
  if (gaps.length === 0) return null

  // #1803 — a gap is in the district the club was in that year, which need
  // not be the page's: name ITS district (the page's keeps its label).
  const labelOf = (districtId: string): string =>
    !opts.pageDistrictId || sameDistrict(districtId, opts.pageDistrictId)
      ? opts.districtLabel
      : lifecycleDistrictLabel(districtId)

  /** Year lists for these reasons, one per district, in first-seen order. */
  const byDistrict = (
    ...reasons: ClubHistorySkipReason[]
  ): Array<[label: string, years: string[]]> => {
    const groups = new Map<string, string[]>()
    for (const g of gaps) {
      if (!reasons.includes(g.reason)) continue
      const label = labelOf(g.districtId)
      groups.set(label, [...(groups.get(label) ?? []), g.label])
    }
    return [...groups]
  }

  const clauses: string[] = []

  for (const [label, years] of byDistrict('district-absent')) {
    clauses.push(
      `${label} has no snapshot for ${listYears(years)} — a club that changed districts is recorded under another district for those years.`
    )
  }

  for (const [label, years] of byDistrict('club-absent')) {
    clauses.push(
      `This club is not in ${label}'s year-end snapshot for ${listYears(years)}; it may have been in another district that year.`
    )
  }

  const movedMidYear = gaps
    .filter(g => g.reason === 'moved-mid-year')
    .map(g => g.label)
  if (movedMidYear.length > 0) {
    clauses.push(
      `This club moved district during ${listYears(movedMidYear)}, so no single district's year-end snapshot holds that year.`
    )
  }

  const unloadable = gaps
    .filter(
      g => g.reason === 'snapshot-unavailable' || g.reason === 'snapshot-failed'
    )
    .map(g => g.label)
  if (unloadable.length > 0) {
    clauses.push(`${listYears(unloadable)} could not be loaded.`)
  }

  return clauses.join(' ')
}

/** "01" and "1" are one district; a lettered id compares case-blind. */
export function sameDistrict(a: string, b: string): boolean {
  const norm = (id: string) =>
    /^\d+$/.test(id) ? String(Number(id)) : id.toUpperCase()
  return norm(a) === norm(b)
}

/** Column headers for the club-history CSV export, in render order. */
export const CLUB_HISTORY_CSV_HEADERS = [
  'Program Year',
  'DCP Goals',
  'Distinguished',
  'Membership Base',
  'Membership End',
  'Membership Net',
  'October Renewals',
  'April Renewals',
  'Status',
  // #1803 — the district the year was recorded under (club-district history).
  'District',
] as const

/** A missing value in the CSV is an empty cell, never an em-dash (keep it numeric). */
function csvCell(value: number | string | null): number | string {
  return value == null ? '' : value
}

/**
 * Shape history rows into a 2D array for `arrayToCSV`. Pure (no DOM) so it can
 * be unit-tested; the download wrapper lives in `csvExport.ts`. The tier column
 * uses the human label, missing values become empty cells.
 */
export function toClubHistoryCsvRows(
  rows: ClubHistoryRow[]
): (string | number)[][] {
  return [
    [...CLUB_HISTORY_CSV_HEADERS],
    ...rows.map(r => [
      r.inProgress ? `${r.label} (in progress)` : r.label,
      csvCell(r.dcpGoals),
      r.tierCode ? r.tierLabel : '',
      csvCell(r.membershipBase),
      csvCell(r.membershipEnd),
      csvCell(r.membershipNet),
      csvCell(r.octoberRenewals),
      csvCell(r.aprilRenewals),
      csvCell(r.clubStatus),
      csvCell(r.districtId ?? null),
    ]),
  ]
}
