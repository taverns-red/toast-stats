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
}

/**
 * Reduce one program year's year-end club record into a history row.
 * An absent `club` (the club did not exist / was not reported that year)
 * yields a no-data row rather than throwing — the table renders em-dashes.
 */
export function buildClubHistoryRow(
  startYear: number,
  yearEndDate: string,
  club: ClubStatisticsFile | undefined
): ClubHistoryRow {
  const label = getProgramYear(startYear).label

  if (!club) {
    return {
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
      r.label,
      csvCell(r.dcpGoals),
      r.tierCode ? r.tierLabel : '',
      csvCell(r.membershipBase),
      csvCell(r.membershipEnd),
      csvCell(r.membershipNet),
      csvCell(r.octoberRenewals),
      csvCell(r.aprilRenewals),
      csvCell(r.clubStatus),
    ]),
  ]
}
