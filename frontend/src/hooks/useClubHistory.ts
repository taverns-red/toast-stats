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
 *  - **Rows for those years** need a club → district-per-year index. #1803:
 *    the club-district history (#1782) is that index. The hook reads the
 *    club's one shard (~12 KB, through the #1843 query, so the club page's
 *    read is reused) alongside the snapshot index, takes each year's district
 *    from `byProgramYear`, and fetches THAT district's year-end — still one
 *    fetch per year, never a fan-out across districts. A year the history
 *    does not list (before 2016-17, or the shard unavailable) falls back to
 *    this district, the pre-#1803 behaviour, so its gap is still reported.
 *    A year with two spans whose year-end district lacks the club is
 *    `moved-mid-year`.
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

import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchCdnSnapshotIndex,
  fetchCdnDistrictSnapshot,
} from '../services/cdn'
import type {
  ClubDistrictHistoryClub,
  PerDistrictData,
} from '@taverns-red/shared-contracts'
import {
  clubDistrictHistoryShardKey,
  clubIdsMatch,
  findClubEntry,
} from '@taverns-red/shared-contracts'
import { clubDistrictHistoryShardQuery } from './useClubDistrictHistoryEntry'
import { getProgramYear, getProgramYearForDate } from '../utils/programYear'
import {
  buildClubHistoryRow,
  sameDistrict,
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
  // The index is every district × every date it holds — tens of thousands of
  // strings. A program year is a function of the year-month alone, so dedupe
  // on `YYYY-MM` first: ~one call per calendar month in the archive instead of
  // one per date. `getProgramYearForDate` stays the single source of the Jul-1
  // boundary — re-deriving it inline here is exactly the drift to avoid.
  const seenMonths = new Set<string>()
  for (const dates of Object.values(index)) {
    if (!Array.isArray(dates)) continue
    for (const d of dates) {
      if (typeof d !== 'string' || !ISO_DATE_PREFIX.test(d)) continue
      const month = d.slice(0, 7)
      if (seenMonths.has(month)) continue
      seenMonths.add(month)
      years.add(getProgramYearForDate(d).year)
    }
  }
  return years
}

/** A program year is complete once its Jun 30 close is in the past. */
function isCompletedProgramYear(startYear: number, now: Date): boolean {
  return new Date(`${startYear + 1}-06-30T23:59:59`) < now
}

/** How many of the club's spans touch a program year (by start year). */
function spansInProgramYear(
  history: ClubDistrictHistoryClub,
  startYear: number
): number {
  return history.spans.filter(span => {
    const from = getProgramYearForDate(span.from).year
    const to = getProgramYearForDate(span.to ?? history.lastSeen).year
    return from <= startYear && startYear <= to
  }).length
}

type YearOutcome =
  | { skip: true }
  | { row: ClubHistoryRow; clubName: string }
  | { gap: ClubHistoryGap }

export function useClubHistory(
  districtId: string | null | undefined,
  clubId: string | null | undefined
): UseClubHistoryResult {
  const enabled = Boolean(districtId && clubId)
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: clubHistoryQueryKey(districtId ?? '', clubId ?? ''),
    enabled,
    queryFn: async (): Promise<ClubHistoryData> => {
      const pageDistrict = districtId!
      const club = clubId!
      // The club's history shard is read beside the index, not after it.
      // A shard that fails resolves null: the history is then unavailable.
      const [index, shard] = await Promise.all([
        fetchCdnSnapshotIndex(),
        queryClient
          .ensureQueryData(
            clubDistrictHistoryShardQuery(clubDistrictHistoryShardKey(club))
          )
          .catch(() => null),
      ])
      const history = shard ? (findClubEntry(shard.clubs, club) ?? null) : null

      // Index keys are the districts' own ids ("01"); match padding-blind.
      const indexKeyFor = (id: string): string =>
        id in index
          ? id
          : (Object.keys(index).find(k => sameDistrict(k, id)) ?? id)

      // A district's own dates are the only ones we can fetch with — they
      // carry the SnapshotDate provenance the per-snapshot fetch requires.
      const yearEndsByDistrict = new Map<string, Map<number, SnapshotDate>>()
      const yearEndsOf = (id: string): Map<number, SnapshotDate> => {
        let byYear = yearEndsByDistrict.get(id)
        if (!byYear) {
          byYear = latestDateByProgramYear(
            snapshotDatesFrom({ dates: index[id] ?? [] })
          )
          yearEndsByDistrict.set(id, byYear)
        }
        return byYear
      }

      // Candidate years come from the WHOLE index, not this district's entry:
      // a club that moved districts has completed years this district never
      // saw, and those must be reported rather than silently skipped (#1437).
      const now = new Date()
      const indexYears = [...programYearsInIndex(index)]
      const completedYears = indexYears
        .filter(y => isCompletedProgramYear(y, now))
        .sort((a, b) => b - a)

      // #1803 (Ron, 2026-10-15) — the program year in progress, by data: the
      // newest year the archive holds that has not closed. It is read from
      // its latest snapshot so far, so a club that moved this July shows its
      // new district. Not closed, so never a gap: a miss just adds no row.
      const openYears = indexYears.filter(y => !isCompletedProgramYear(y, now))
      const inProgressYear = openYears.length ? Math.max(...openYears) : null
      const candidateYears =
        inProgressYear === null
          ? completedYears
          : [inProgressYear, ...completedYears]

      const gapFor = (
        startYear: number,
        district: string,
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

      // At most one fetch per completed year — the year-end of the district
      // the club was in that year. No cross-district fan-out.
      const outcomes = await Promise.all(
        candidateYears.map(async (startYear): Promise<YearOutcome> => {
          const inProgress = startYear === inProgressYear
          const label = getProgramYear(startYear).label
          const district = indexKeyFor(
            history?.byProgramYear[label] ?? pageDistrict
          )
          const yearEndDate = yearEndsOf(district).get(startYear)
          if (!yearEndDate)
            return inProgress
              ? { skip: true }
              : gapFor(startYear, district, null, 'district-absent')

          let found
          try {
            // The dated file is a PerDistrictData ENVELOPE — the parsed clubs
            // live at `.data.clubs` (the diff engine unwraps the same way, see
            // useSnapshotDiff). A `failed` collection has no usable `.data`.
            const snap = await fetchCdnDistrictSnapshot<PerDistrictData>(
              yearEndDate,
              district
            )
            if (snap.status === 'failed') {
              return inProgress
                ? { skip: true }
                : gapFor(startYear, district, yearEndDate, 'snapshot-failed')
            }
            // Toastmasters emits both `00002274` and `2274` and the transformer
            // stores whichever arrived, so identity is the normalized form —
            // a strict `===` here dropped the row silently (#1437, #1440).
            found = snap.data?.clubs?.find(c => clubIdsMatch(c.clubId, club))
          } catch {
            // A missing year-end snapshot for this district — report the year
            // rather than fail the whole history (the index can outrun storage).
            if (inProgress) return { skip: true }
            return gapFor(
              startYear,
              district,
              yearEndDate,
              'snapshot-unavailable'
            )
          }
          if (!found) {
            if (inProgress) return { skip: true }
            const split = history && spansInProgramYear(history, startYear) > 1
            return gapFor(
              startYear,
              district,
              yearEndDate,
              split ? 'moved-mid-year' : 'club-absent'
            )
          }
          const row = buildClubHistoryRow(
            startYear,
            yearEndDate,
            found,
            district
          )
          return {
            row: inProgress ? { ...row, inProgress: true } : row,
            clubName: found.clubName,
          }
        })
      )

      // `completedYears` is newest-first, so both lists inherit that order —
      // which makes the FIRST row's name the most recent one on record.
      const rows: ClubHistoryRow[] = []
      const gaps: ClubHistoryGap[] = []
      let clubName: string | null = null
      for (const outcome of outcomes) {
        if ('skip' in outcome) continue
        if ('gap' in outcome) {
          gaps.push(outcome.gap)
          continue
        }
        rows.push(outcome.row)
        clubName ??= outcome.clubName
      }
      return { rows, gaps, clubName }
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
