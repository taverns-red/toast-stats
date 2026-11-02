/* Data for the region and world What Changed pages (#2476, phase 1).

   Dates: the union of the per-district snapshot index, the same file the
   district What Changed page reads its dates from, so both offer the same
   days and both pick up month-end reconciliation revisions (#2475) when the
   pipeline adds them to that index.

   Rows: each date's `snapshots/<date>/all-districts-rankings.json`, read
   exactly (no fall back to latest): a missing file is named, never diffed
   as another date's numbers. The page owns the pair and passes it (R3). */
import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { snapshotIndexQueryOptions } from './snapshotIndexQuery'
import { exactRankingsQueryOptions } from './districtRankingsQuery'
import { snapshotDatesFrom, type SnapshotDate } from '../types/snapshotDate'
import { recordedDatesUnion, type RankingsDiffRow } from '../utils/rankingsDiff'

export function useRecordedDates(): {
  dates: SnapshotDate[]
  isLoading: boolean
} {
  const { data, isLoading } = useQuery(snapshotIndexQueryOptions())
  const dates = useMemo(
    () => (data ? snapshotDatesFrom({ dates: recordedDatesUnion(data) }) : []),
    [data]
  )
  return { dates, isLoading }
}

/** Both dates' rows; nothing is fetched until both ends are set. */
export function useRankingsPair(
  from: SnapshotDate | undefined,
  to: SnapshotDate | undefined
): {
  fromRows: RankingsDiffRow[]
  toRows: RankingsDiffRow[]
  isLoading: boolean
  isError: boolean
  /** Dates whose rankings file is missing. */
  missing: SnapshotDate[]
} {
  const pair = from && to ? [from, to] : []
  const [a, b] = useQueries({ queries: pair.map(exactRankingsQueryOptions) })
  const missing = pair.filter((_, i) => [a, b][i]?.data === null)
  return {
    fromRows: a?.data?.rankings ?? [],
    toRows: b?.data?.rankings ?? [],
    isLoading: !!a?.isLoading || !!b?.isLoading,
    isError: !!a?.isError || !!b?.isError,
    missing,
  }
}
