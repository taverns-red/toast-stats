/**
 * useClubGrowthRecipients (#1537) — every district's District Club Growth
 * Achievement verdict at each checkpoint of a program year, for the
 * worldwide recipients view on `/awards`.
 *
 * It is the all-districts sibling of `useClubGrowthMilestones` (#1475) and
 * keeps that hook's load-bearing invariant: a checkpoint is judged on THAT
 * DATE'S OWN `snapshots/{date}/all-districts-rankings.json`, read with
 * `fetchCdnRankingsForDateExact` (null on 404), never on current rankings.
 * A district's charter count can fall mid-year without any charter being
 * revoked — clubs chartered this year move districts and take the credit
 * with them — so today's file would rewrite a September verdict. The two
 * hooks share the plan, the query key and the uncollected-count tell, so the
 * district card and this list read one file and can never disagree.
 *
 * The tier a district reached is decided by the #1474 predicate
 * (`resolveClubGrowthAchievement`), never by a second copy of 3 / 5 / 10.
 *
 * R3: program year and the page's pinned as-of date come from the parent.
 */
import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  fetchCdnRankingsForDateExact,
  fetchCdnSnapshotIndex,
  type CdnRankingsData,
} from '../services/cdn'
import {
  availableSnapshotDates,
  checkpointRankingsQueryKey,
  clubGrowthCheckpointDates,
  isUncollectedCharterCount,
  resolveCheckpointPlan,
  snapshotIndexQueryKey,
  type ClubGrowthCheckpointId,
} from './useClubGrowthMilestones'
import {
  resolveClubGrowthAchievement,
  type ClubGrowthCheckpointId as PredicateCheckpointId,
} from '../utils/clubGrowthAchievement'
import type { SnapshotDate } from '../types/snapshotDate'
import type { ProgramYear } from '../utils/programYear'

export interface ClubGrowthRecipient {
  districtId: string
  districtName: string
  region: string
  /** Charters as of the checkpoint, from that date's own file. */
  count: number
  /** Highest milestone reached (A3). */
  milestone: number
}

export type ClubGrowthRecipientsUnavailableReason =
  /** No snapshot at or before the checkpoint, or its file is gone. */
  | 'snapshot-missing'
  /** The file predates #336 — no row carries `newCharteredClubs`. */
  | 'count-absent'
  /** Field present but zero everywhere: not collected (#1501). */
  | 'count-not-collected'

export type ClubGrowthRecipientsCheckpoint = {
  id: ClubGrowthCheckpointId
  /** The canonical deadline, e.g. `2026-09-30`. */
  checkpointDate: string
  /** The checkpoint's milestones, ascending — from the predicate. */
  milestones: readonly number[]
} & (
  | { status: 'loading' }
  | { status: 'pending' }
  | {
      status: 'resolved'
      /** Highest milestone first, then count, then district id. */
      recipients: ClubGrowthRecipient[]
      resolvedFromDate: SnapshotDate
      /** The file's own as-of (`sourceCsvDate`) — provenance only. */
      asOfDate: string
    }
  | { status: 'unavailable'; reason: ClubGrowthRecipientsUnavailableReason }
)

export type UseClubGrowthRecipientsResult =
  | { applicable: false }
  | {
      applicable: true
      /** September first, then March. */
      checkpoints: ClubGrowthRecipientsCheckpoint[]
      isLoading: boolean
    }

const PREDICATE_ID: Record<ClubGrowthCheckpointId, PredicateCheckpointId> = {
  september: 'september30',
  march: 'march31',
}

/** Natural district order: numeric ids ascending, then lettered ones. */
const byDistrictId = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true })

/**
 * Every district's verdict at one settled checkpoint, decided by the
 * predicate. Rows without a numeric count are skipped (they cannot be judged).
 */
export function recipientsAtCheckpoint(
  data: CdnRankingsData,
  programYear: string,
  checkpoint: { id: ClubGrowthCheckpointId; date: string }
): ClubGrowthRecipient[] {
  const predicateId = PREDICATE_ID[checkpoint.id]
  const recipients: ClubGrowthRecipient[] = []
  for (const row of data.rankings) {
    if (typeof row.newCharteredClubs !== 'number') continue
    const verdict = resolveClubGrowthAchievement({
      programYear,
      asOfDate: checkpoint.date,
      ...(predicateId === 'september30'
        ? { sep30Count: row.newCharteredClubs }
        : { mar31Count: row.newCharteredClubs }),
    })
    if (!verdict.applicable) continue
    const state = verdict.checkpoints.find(c => c.id === predicateId)
    if (state?.status !== 'settled' || state.milestoneReached === null) continue
    recipients.push({
      districtId: row.districtId,
      districtName: row.districtName,
      region: row.region,
      count: row.newCharteredClubs,
      milestone: state.milestoneReached,
    })
  }
  return recipients.sort(
    (a, b) =>
      b.milestone - a.milestone ||
      b.count - a.count ||
      byDistrictId(a.districtId, b.districtId)
  )
}

export function useClubGrowthRecipients(
  programYear: ProgramYear,
  asOfDate: string | undefined
): UseClubGrowthRecipientsResult {
  // The predicate owns the forward-only gate (A1/A5) and the milestones.
  const gate = resolveClubGrowthAchievement({
    programYear: programYear.label,
    asOfDate: asOfDate ?? '',
  })
  const applicable = gate.applicable

  const checkpoints = useMemo(
    () => clubGrowthCheckpointDates(programYear),
    [programYear]
  )

  const indexQuery = useQuery({
    queryKey: snapshotIndexQueryKey,
    queryFn: fetchCdnSnapshotIndex,
    staleTime: 60 * 60 * 1000,
    enabled: applicable,
  })

  const availableDates = useMemo(
    () => (indexQuery.data ? availableSnapshotDates(indexQuery.data) : null),
    [indexQuery.data]
  )

  const plans = useMemo(
    () =>
      checkpoints.map(cp => {
        if (!availableDates || !asOfDate) return { ...cp, plan: null }
        const plan = resolveCheckpointPlan(cp.date, availableDates)
        // The page's own pinned date decides too (R3): a reader looking at
        // September 15 sees the race, not a verdict from the future.
        const settled = plan.settled && asOfDate.slice(0, 10) >= cp.date
        return {
          ...cp,
          plan: settled ? plan : { settled: false, snapshotDate: null },
        }
      }),
    [checkpoints, availableDates, asOfDate]
  )

  const results = useQueries({
    queries: plans.map(({ id, plan }) => {
      const date = plan?.snapshotDate
      if (!applicable || !date) {
        return {
          queryKey: ['rankings-checkpoint', 'unresolved', id],
          queryFn: async (): Promise<CdnRankingsData | null> => null,
          enabled: false,
        }
      }
      return {
        // Shared with useClubGrowthMilestones: one file, one cache entry.
        queryKey: checkpointRankingsQueryKey(date),
        queryFn: () => fetchCdnRankingsForDateExact(date),
        staleTime: 60 * 60 * 1000,
      }
    }),
  })

  if (!applicable) return { applicable: false }

  const milestonesFor = (id: ClubGrowthCheckpointId): readonly number[] =>
    gate.checkpoints.find(c => c.id === PREDICATE_ID[id])?.milestones ?? []

  const resolved = plans.map(
    ({ id, date, plan }, i): ClubGrowthRecipientsCheckpoint => {
      const base = { id, checkpointDate: date, milestones: milestonesFor(id) }
      // No availability set at all: nothing can be placed on a date.
      if (indexQuery.isError) {
        return { ...base, status: 'unavailable', reason: 'snapshot-missing' }
      }
      if (!plan) return { ...base, status: 'loading' }
      if (!plan.settled) return { ...base, status: 'pending' }
      if (!plan.snapshotDate) {
        return { ...base, status: 'unavailable', reason: 'snapshot-missing' }
      }
      const query = results[i]
      if (query?.data === undefined && !query?.isError) {
        return { ...base, status: 'loading' }
      }
      if (query?.isError || query?.data == null) {
        return { ...base, status: 'unavailable', reason: 'snapshot-missing' }
      }
      const data = query.data
      if (!data.rankings.some(r => typeof r.newCharteredClubs === 'number')) {
        return { ...base, status: 'unavailable', reason: 'count-absent' }
      }
      if (isUncollectedCharterCount(data)) {
        return { ...base, status: 'unavailable', reason: 'count-not-collected' }
      }
      return {
        ...base,
        status: 'resolved',
        recipients: recipientsAtCheckpoint(data, programYear.label, {
          id,
          date,
        }),
        resolvedFromDate: plan.snapshotDate,
        asOfDate: data.asOfDate,
      }
    }
  )

  return {
    applicable: true,
    checkpoints: resolved,
    isLoading: resolved.some(c => c.status === 'loading'),
  }
}
