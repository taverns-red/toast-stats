/**
 * useClubGrowthMilestones (#1475, epic #1473) — resolves the club-charter count
 * a District Club Growth Achievement checkpoint is judged on.
 *
 * Toastmasters' new achievement recognises districts that charter 3 or 5 new
 * clubs by **September 30** and 3, 5 or 10 by **March 31**. The count is
 * `newCharteredClubs` on the district's rankings row — cumulative from July 1,
 * so March includes what September already counted.
 *
 * ## Why this hook exists at all: the checkpoint must read the checkpoint's file
 *
 * A district's `newCharteredClubs` **can decrease** mid-program-year — 9
 * occurrences in PY 2025-26 — with no charter revoked. Clubs chartered this
 * year MOVE between districts and the count follows them; the global sum is
 * strictly monotonic (81 → 638 across the year), so nothing is lost, it
 * relocates. A club chartered in September under district A that moves to
 * district B in April must not retroactively erase A's September 30
 * achievement, and today's number is not even a safe upper bound for a past
 * date. So the verdict is read from the checkpoint's OWN
 * `snapshots/{date}/all-districts-rankings.json`, never recomputed from current
 * rankings.
 *
 * That makes `fetchCdnRankingsForDate`'s silent latest-date fallback the
 * primary hazard on this path: it answers a 404 with `v1/rankings.json`, which
 * would put today's cumulative count under a September 30 label and award a
 * milestone that was never earned. This hook only ever calls
 * `fetchCdnRankingsForDateExact`, whose missing file is `null` — surfaced as
 * `unavailable`, never as a substituted figure.
 *
 * ## The three answers, kept distinct
 *
 * - `pending` — the archive has not reached the checkpoint yet. Nothing has
 *   been decided; the live race number comes from the caller's existing
 *   `useDistrictRanking` row, not from here.
 * - `resolved` — a count, plus the snapshot date it came from.
 * - `unavailable` — the checkpoint is settled but its count cannot be read
 *   (no file, district absent from that file, or a pre-#336 file that omits
 *   the field). Deliberately NOT `0`: "we cannot say" is a different claim
 *   from "chartered nothing".
 *
 * `loading` is the fourth state and covers the window before the availability
 * set has landed — a status published from an empty archive would be an
 * assertion, not a placeholder.
 *
 * R3: the program year is passed in by the parent, never derived from response
 * data.
 */
import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  fetchCdnRankingsForDateExact,
  fetchCdnSnapshotIndex,
  type CdnRankingsData,
} from '../services/cdn'
import { snapshotDatesFrom, type SnapshotDate } from '../types/snapshotDate'
import type { ProgramYear } from '../utils/programYear'

/** The two checkpoints TI judges the achievement on. */
export type ClubGrowthCheckpointId = 'september' | 'march'

export type ClubGrowthCheckpointStatus =
  'loading' | 'pending' | 'resolved' | 'unavailable'

export type ClubGrowthUnavailableReason =
  /** No snapshot at or before the checkpoint, or its file is gone. */
  | 'snapshot-missing'
  /** The file exists but carries no row for this district. */
  | 'district-absent'
  /** The row exists but predates #336 and omits `newCharteredClubs`. */
  | 'count-absent'

export interface ClubGrowthCheckpoint {
  id: ClubGrowthCheckpointId
  /** The canonical deadline, e.g. `2026-09-30`. NOT a snapshot date. */
  checkpointDate: string
  status: ClubGrowthCheckpointStatus
  /** Charters as of the checkpoint; null unless `status === 'resolved'`. */
  newCharteredClubs: number | null
  /** The pinned snapshot actually read, null if none was. */
  resolvedFromDate: SnapshotDate | null
  /** That file's as-of (`sourceCsvDate`) date — provenance/display only. */
  asOfDate: string | null
  /** True when no run landed on the checkpoint and a prior one was used. */
  isFallbackDate: boolean
  unavailableReason: ClubGrowthUnavailableReason | null
}

export interface UseClubGrowthMilestonesResult {
  /** September first, then March. */
  checkpoints: ClubGrowthCheckpoint[]
  /** True while any checkpoint is still `loading`. */
  isLoading: boolean
}

/** Query key for one checkpoint's rankings file — the PINNED date, per #1315. */
export const checkpointRankingsQueryKey = (
  date: SnapshotDate
): readonly unknown[] => ['rankings-checkpoint', date]

/** Query key for the shared district snapshot index (the availability set). */
export const snapshotIndexQueryKey: readonly unknown[] = [
  'district-snapshot-index',
]

/**
 * The checkpoint deadlines for a program year (Jul 1 – Jun 30), in order.
 * September falls in the start year, March in the following one.
 */
export function clubGrowthCheckpointDates(
  programYear: ProgramYear
): { id: ClubGrowthCheckpointId; date: string }[] {
  return [
    { id: 'september', date: `${programYear.year}-09-30` },
    { id: 'march', date: `${programYear.year + 1}-03-31` },
  ]
}

export interface CheckpointPlan {
  /** True once the archive proves the pipeline advanced past the checkpoint. */
  settled: boolean
  /** Nearest available date at or before the checkpoint, if any. */
  snapshotDate: SnapshotDate | null
}

/**
 * Decide which snapshot answers a checkpoint, from the availability set alone.
 *
 * **Settledness** is "any date ≥ the checkpoint exists" — proof the pipeline
 * ran past it. Without that, an earlier file is a mid-race number, not a
 * verdict.
 *
 * **The read** is the nearest available date ≤ the checkpoint. Sep 30 and
 * Mar 31 are month-ends and survive pruning, so this normally resolves exactly;
 * the fallback covers a missed run (precedent: `useClubGoalTimeline`, #621).
 */
export function resolveCheckpointPlan(
  checkpointDate: string,
  availableDates: readonly SnapshotDate[]
): CheckpointPlan {
  let settled = false
  let nearestPrior: SnapshotDate | null = null
  for (const date of availableDates) {
    if (date >= checkpointDate) settled = true
    if (date <= checkpointDate && (!nearestPrior || date > nearestPrior)) {
      nearestPrior = date
    }
  }
  return { settled, snapshotDate: settled ? nearestPrior : null }
}

/** A checkpoint carrying no answer yet — the shape every branch starts from. */
function baseCheckpoint(
  id: ClubGrowthCheckpointId,
  checkpointDate: string,
  status: ClubGrowthCheckpointStatus
): ClubGrowthCheckpoint {
  return {
    id,
    checkpointDate,
    status,
    newCharteredClubs: null,
    resolvedFromDate: null,
    asOfDate: null,
    isFallbackDate: false,
    unavailableReason: null,
  }
}

/** Read one district's count out of a checkpoint file, keeping each miss distinct. */
function readCount(
  data: CdnRankingsData,
  districtId: string
):
  | { count: number; reason?: undefined }
  | { count?: undefined; reason: ClubGrowthUnavailableReason } {
  const row = data.rankings.find(r => r.districtId === districtId)
  if (!row) return { reason: 'district-absent' }
  if (typeof row.newCharteredClubs !== 'number') {
    return { reason: 'count-absent' }
  }
  return { count: row.newCharteredClubs }
}

export function useClubGrowthMilestones(
  districtId: string | undefined,
  programYear: ProgramYear
): UseClubGrowthMilestonesResult {
  const checkpoints = useMemo(
    () => clubGrowthCheckpointDates(programYear),
    [programYear]
  )

  // The availability set: the union of every date in the district snapshot
  // index. A dated rankings file is global (all districts in one file), so its
  // existence is not a per-district fact.
  const indexQuery = useQuery({
    queryKey: snapshotIndexQueryKey,
    queryFn: fetchCdnSnapshotIndex,
    staleTime: 60 * 60 * 1000,
  })

  const availableDates = useMemo(() => {
    if (!indexQuery.data) return null
    const union = new Set<string>()
    for (const dates of Object.values(indexQuery.data)) {
      for (const date of dates ?? []) union.add(date)
    }
    // Minted from the pipeline's own enumeration of what it wrote — the
    // provenance the SnapshotDate brand claims.
    return snapshotDatesFrom({ dates: [...union] })
  }, [indexQuery.data])

  const plans = useMemo(
    () =>
      checkpoints.map(cp => ({
        ...cp,
        plan: availableDates
          ? resolveCheckpointPlan(cp.date, availableDates)
          : null,
      })),
    [checkpoints, availableDates]
  )

  // One query per checkpoint, keyed on the PINNED snapshot date so two
  // checkpoints (or two districts) share the file they read, and so no key ever
  // carries an as-of date. `enabled` keeps the unscoped-first window shut: no
  // fetch is issued until the availability set has named a date.
  const results = useQueries({
    queries: plans.map(({ id, plan }) => {
      const date = plan?.snapshotDate
      if (!date) {
        // A placeholder slot so the results array stays index-aligned with the
        // checkpoints; it can never run. Its key is per-checkpoint so two
        // unresolved checkpoints never collide into one observer entry.
        return {
          queryKey: ['rankings-checkpoint', 'unresolved', id],
          queryFn: async (): Promise<CdnRankingsData | null> => null,
          enabled: false,
        }
      }
      return {
        queryKey: checkpointRankingsQueryKey(date),
        queryFn: () => fetchCdnRankingsForDateExact(date),
        enabled: Boolean(districtId),
        staleTime: 60 * 60 * 1000,
      }
    }),
  })

  const resolved = plans.map(({ id, date, plan }, i): ClubGrowthCheckpoint => {
    // Nothing may be claimed before the availability set lands, and a district
    // we have not been given is not a question we can answer yet.
    if (!plan || !districtId) return baseCheckpoint(id, date, 'loading')
    if (!plan.settled) return baseCheckpoint(id, date, 'pending')
    if (!plan.snapshotDate) {
      return {
        ...baseCheckpoint(id, date, 'unavailable'),
        unavailableReason: 'snapshot-missing',
      }
    }

    const query = results[i]
    // A query that just became `enabled` is idle, not fetching — gate on the
    // absence of a settled result, never on isFetching/isLoading.
    const unresolved = query?.data === undefined && !query?.isError
    if (unresolved) return baseCheckpoint(id, date, 'loading')

    const isFallbackDate = plan.snapshotDate !== date
    // `null` here is a 404 from the exact fetch: the file is gone. The falling
    // back fetcher would have handed back today's rankings instead — that
    // substitution is the whole reason this path uses the exact variant.
    if (query?.isError || query?.data == null) {
      return {
        ...baseCheckpoint(id, date, 'unavailable'),
        resolvedFromDate: plan.snapshotDate,
        isFallbackDate,
        unavailableReason: 'snapshot-missing',
      }
    }

    const read = readCount(query.data, districtId)
    if (read.reason) {
      return {
        ...baseCheckpoint(id, date, 'unavailable'),
        resolvedFromDate: plan.snapshotDate,
        asOfDate: query.data.asOfDate,
        isFallbackDate,
        unavailableReason: read.reason,
      }
    }

    return {
      ...baseCheckpoint(id, date, 'resolved'),
      newCharteredClubs: read.count,
      resolvedFromDate: plan.snapshotDate,
      asOfDate: query.data.asOfDate,
      isFallbackDate,
    }
  })

  return {
    checkpoints: resolved,
    isLoading: resolved.some(c => c.status === 'loading'),
  }
}
