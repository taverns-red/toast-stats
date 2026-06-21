/**
 * useClubHistory (#1229, epic #1228) — per-program-year history for one club.
 *
 * Assembled entirely from EXISTING CDN endpoints, no new pipeline step:
 *   1. `fetchCdnSnapshotIndex()` — every district's available snapshot dates.
 *      Grouped by program year (Jul 1 – Jun 30), the LATEST date in each
 *      COMPLETED year is that year's settled (year-end) snapshot. Taking the
 *      max in-PY date IS the nearest-prior-to-Jun-30 fallback (#621), and it
 *      sidesteps the Lesson 139 trap: a July-dated year-end freeze stays inside
 *      its own program year here, so no completed year is silently dropped.
 *   2. `fetchCdnDistrictSnapshot(date, districtId)` — that date's district
 *      snapshot, reduced to one `ClubHistoryRow` by `buildClubHistoryRow`.
 *
 * `fetchCdnDistrictSnapshot` THROWS on a missing file (no silent fallback to
 * current data — contrast `fetchCdnRankingsForDate`), so a year whose snapshot
 * fails to load is tolerated and skipped rather than mislabeled. A completed
 * year in which this club has no record is also skipped — the per-club view
 * shows only the years the club actually existed (single-year states included).
 */

import { useQuery } from '@tanstack/react-query'
import {
  fetchCdnSnapshotIndex,
  fetchCdnDistrictSnapshot,
} from '../services/cdn'
import type { PerDistrictData } from '@toastmasters/shared-contracts'
import { getProgramYearForDate } from '../utils/programYear'
import { buildClubHistoryRow, type ClubHistoryRow } from '../utils/clubHistory'

export const clubHistoryQueryKey = (
  districtId: string,
  clubId: string
): readonly unknown[] => ['club-history', districtId, clubId]

interface ClubHistoryData {
  rows: ClubHistoryRow[]
  /** Most recent name the club was recorded under, for headings/breadcrumbs. */
  clubName: string | null
}

export interface UseClubHistoryResult {
  /** Completed program years the club appears in, newest first. */
  rows: ClubHistoryRow[]
  /** Most recent name the club was recorded under, or null if never found. */
  clubName: string | null
  isLoading: boolean
  isError: boolean
  error: Error | null
}

/** Latest snapshot date within each program year, for one district. */
function latestDateByProgramYear(dates: string[]): Map<number, string> {
  const latestByYear = new Map<number, string>()
  for (const d of dates) {
    // getProgramYearForDate parses the ISO string via calendarParts (regex,
    // timezone-safe) — not new Date() — so the Jul-1 boundary is exact.
    const startYear = getProgramYearForDate(d).year
    const cur = latestByYear.get(startYear)
    if (!cur || d > cur) latestByYear.set(startYear, d)
  }
  return latestByYear
}

export function useClubHistory(
  districtId: string | null | undefined,
  clubId: string | null | undefined
): UseClubHistoryResult {
  const enabled = Boolean(districtId && clubId)

  const query = useQuery({
    queryKey: clubHistoryQueryKey(districtId ?? '', clubId ?? ''),
    enabled,
    queryFn: async (): Promise<ClubHistoryData> => {
      const index = await fetchCdnSnapshotIndex()
      const dates = index[districtId!] ?? []

      // Latest date per program year → keep only COMPLETED years, newest first.
      const now = new Date()
      const completed = [...latestDateByProgramYear(dates).entries()]
        .filter(
          ([startYear]) => new Date(`${startYear + 1}-06-30T23:59:59`) < now
        )
        .sort(([a], [b]) => b - a)

      // One fetch per completed year. Each yields the history row plus the
      // name the club was recorded under that year (for heading/breadcrumb).
      const built = await Promise.all(
        completed.map(async ([startYear, yearEndDate]) => {
          let club
          try {
            // The dated file is a PerDistrictData ENVELOPE — the parsed clubs
            // live at `.data.clubs` (the diff engine unwraps the same way, see
            // useSnapshotDiff). A `failed` collection has no usable `.data`.
            const snap = await fetchCdnDistrictSnapshot<PerDistrictData>(
              yearEndDate,
              districtId!
            )
            if (snap.status === 'failed') return null
            club = snap.data?.clubs?.find(c => c.clubId === clubId)
          } catch {
            // A missing year-end snapshot for this district — skip the year
            // rather than fail the whole history (the index can outrun storage).
            return null
          }
          // The club did not exist / was not reported that year — skip it.
          if (!club) return null
          return {
            row: buildClubHistoryRow(startYear, yearEndDate, club),
            clubName: club.clubName,
          }
        })
      )

      const resolved = built.filter(
        (r): r is { row: ClubHistoryRow; clubName: string } => r !== null
      )
      // `completed` is newest-first, so the first resolved name is the most recent.
      return {
        rows: resolved.map(r => r.row),
        clubName: resolved[0]?.clubName ?? null,
      }
    },
    staleTime: 15 * 60 * 1000, // archived years are immutable
    gcTime: 30 * 60 * 1000,
    retry: failureCount => failureCount < 2,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
  })

  return {
    rows: query.data?.rows ?? [],
    clubName: query.data?.clubName ?? null,
    isLoading: enabled ? query.isLoading : false,
    isError: query.isError,
    error: query.error,
  }
}
