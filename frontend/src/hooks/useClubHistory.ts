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
 * ## A club's history is keyed on its CLUB NUMBER, not on a district (#1437)
 *
 * Toastmasters' 2026-07-01 reformation merged and split districts and moved
 * clubs between them. A club is continuous across that move — same club, same
 * club number, same charter — only its parent district changed. Two things
 * followed from reconstructing history by fixing a district first:
 *
 *  - **Candidate years** used to come from ONE district's index entry
 *    (`index[districtId]`), so a year the club spent elsewhere was never even
 *    considered. Candidate years now come from the WHOLE index — the set of
 *    completed program years the archive covers — and each year is resolved
 *    against this district's own dates. A year this district cannot cover is
 *    REPORTED as a gap instead of vanishing.
 *  - **Rows for those years still cannot be fetched here.** Recovering them
 *    needs a club → district-per-year index the pipeline does not emit
 *    (`config/club-index.json` is rebuilt from the LATEST date only, so it
 *    knows one district per club and no history). The alternative — probing
 *    every district's year-end snapshot — is ~100 multi-hundred-KB fetches per
 *    missing year, which is not a read-path we can put behind a page load. So
 *    the hook reports the gap honestly rather than half-fixing it. See #1436.
 *
 * ## Every skip used to look the same (#1437)
 *
 * `fetchCdnDistrictSnapshot` THROWS on a missing file (no silent fallback to
 * current data — contrast `fetchCdnRankingsForDate`), a `failed` collection
 * has no usable `.data`, and a club can simply be absent. All three used to
 * `return null` and be filtered away, so three distinct facts rendered as one
 * empty table (the Lesson 47 signature). Each now yields a `ClubHistoryGap`
 * carrying its reason, and the page says which case it is.
 */

import { useQuery } from '@tanstack/react-query'
import {
  fetchCdnSnapshotIndex,
  fetchCdnDistrictSnapshot,
} from '../services/cdn'
import type { PerDistrictData } from '@taverns-red/shared-contracts'
import { clubIdsMatch } from '@taverns-red/shared-contracts'
import { getProgramYear, getProgramYearForDate } from '../utils/programYear'
import {
  buildClubHistoryRow,
  type ClubHistoryGap,
  type ClubHistoryRow,
} from '../utils/clubHistory'
import { snapshotDatesFrom, type SnapshotDate } from '../types/snapshotDate'

export type { ClubHistoryGap } from '../utils/clubHistory'

export const clubHistoryQueryKey = (
  districtId: string,
  clubId: string
): readonly unknown[] => ['club-history', districtId, clubId]

interface ClubHistoryData {
  rows: ClubHistoryRow[]
  gaps: ClubHistoryGap[]
  /** Most recent name the club was recorded under, for headings/breadcrumbs. */
  clubName: string | null
}

export interface UseClubHistoryResult {
  /** Completed program years the club appears in, newest first. */
  rows: ClubHistoryRow[]
  /** Completed program years that produced no row, newest first, with why. */
  gaps: ClubHistoryGap[]
  /** Most recent name the club was recorded under, or null if never found. */
  clubName: string | null
  isLoading: boolean
  isError: boolean
  error: Error | null
}

/** Well-formed `YYYY-MM-DD`; anything else in a remote index is ignored. */
const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}$/

/**
 * Latest snapshot date within each program year, for one district.
 *
 * Generic in the date type so a branded `SnapshotDate[]` yields branded values:
 * every entry is an ELEMENT of `dates`, so it carries the caller's provenance
 * straight through to the per-snapshot fetch below (#1323).
 */
function latestDateByProgramYear<T extends string>(
  dates: readonly T[]
): Map<number, T> {
  const latestByYear = new Map<number, T>()
  for (const d of dates) {
    // getProgramYearForDate parses the ISO string via calendarParts (regex,
    // timezone-safe) — not new Date() — so the Jul-1 boundary is exact.
    const startYear = getProgramYearForDate(d).year
    const cur = latestByYear.get(startYear)
    if (!cur || d > cur) latestByYear.set(startYear, d)
  }
  return latestByYear
}

/**
 * Every program year the archive covers, across ALL districts (#1437).
 *
 * Deliberately NOT branded: these years are used to enumerate candidates, and
 * the only dates that reach a fetch are this district's own (already minted).
 * A district that vanished in the reformation still contributes its years —
 * that is the point, since the club may have spent them there.
 */
function programYearsInIndex(
  index: Record<string, string[] | undefined>
): Set<number> {
  const years = new Set<number>()
  for (const dates of Object.values(index)) {
    if (!Array.isArray(dates)) continue
    for (const d of dates) {
      if (typeof d !== 'string' || !ISO_DATE_PREFIX.test(d)) continue
      years.add(getProgramYearForDate(d).year)
    }
  }
  return years
}

/** A program year is complete once its Jun 30 close is in the past. */
function isCompletedProgramYear(startYear: number, now: Date): boolean {
  return new Date(`${startYear + 1}-06-30T23:59:59`) < now
}

type YearOutcome =
  { row: ClubHistoryRow; clubName: string } | { gap: ClubHistoryGap }

export function useClubHistory(
  districtId: string | null | undefined,
  clubId: string | null | undefined
): UseClubHistoryResult {
  const enabled = Boolean(districtId && clubId)

  const query = useQuery({
    queryKey: clubHistoryQueryKey(districtId ?? '', clubId ?? ''),
    enabled,
    queryFn: async (): Promise<ClubHistoryData> => {
      const district = districtId!
      const index = await fetchCdnSnapshotIndex()

      // This district's own dates are the only ones we can fetch with — they
      // carry the SnapshotDate provenance the per-snapshot fetch requires.
      const ownYearEnd = latestDateByProgramYear(
        snapshotDatesFrom({ dates: index[district] ?? [] })
      )

      // Candidate years come from the WHOLE index, not this district's entry:
      // a club that moved districts has completed years this district never
      // saw, and those must be reported rather than silently skipped (#1437).
      const now = new Date()
      const completedYears = [...programYearsInIndex(index)]
        .filter(y => isCompletedProgramYear(y, now))
        .sort((a, b) => b - a)

      const gapFor = (
        startYear: number,
        yearEndDate: SnapshotDate | null,
        reason: ClubHistoryGap['reason']
      ): YearOutcome => ({
        gap: {
          startYear,
          label: getProgramYear(startYear).label,
          districtId: district,
          yearEndDate,
          reason,
        },
      })

      // At most one fetch per completed year — this district's own year-end.
      // No cross-district fan-out: see the module header.
      const outcomes = await Promise.all(
        completedYears.map(async (startYear): Promise<YearOutcome> => {
          const yearEndDate = ownYearEnd.get(startYear)
          if (!yearEndDate) return gapFor(startYear, null, 'district-absent')

          let club
          try {
            // The dated file is a PerDistrictData ENVELOPE — the parsed clubs
            // live at `.data.clubs` (the diff engine unwraps the same way, see
            // useSnapshotDiff). A `failed` collection has no usable `.data`.
            const snap = await fetchCdnDistrictSnapshot<PerDistrictData>(
              yearEndDate,
              district
            )
            if (snap.status === 'failed') {
              return gapFor(startYear, yearEndDate, 'snapshot-failed')
            }
            // Toastmasters emits both `00002274` and `2274` and the transformer
            // stores whichever arrived, so identity is the normalized form —
            // a strict `===` here dropped the row silently (#1437, #1440).
            club = snap.data?.clubs?.find(c => clubIdsMatch(c.clubId, clubId))
          } catch {
            // A missing year-end snapshot for this district — report the year
            // rather than fail the whole history (the index can outrun storage).
            return gapFor(startYear, yearEndDate, 'snapshot-unavailable')
          }
          if (!club) return gapFor(startYear, yearEndDate, 'club-absent')
          return {
            row: buildClubHistoryRow(startYear, yearEndDate, club),
            clubName: club.clubName,
          }
        })
      )

      // `completedYears` is newest-first, so both lists inherit that order and
      // the first resolved name is the most recent one on record.
      const resolved = outcomes.filter(
        (o): o is { row: ClubHistoryRow; clubName: string } => 'row' in o
      )
      return {
        rows: resolved.map(r => r.row),
        gaps: outcomes
          .filter((o): o is { gap: ClubHistoryGap } => 'gap' in o)
          .map(o => o.gap),
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
    gaps: query.data?.gaps ?? [],
    clubName: query.data?.clubName ?? null,
    isLoading: enabled ? query.isLoading : false,
    isError: query.isError,
    error: query.error,
  }
}
