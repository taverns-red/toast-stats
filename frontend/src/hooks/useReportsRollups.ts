/**
 * Reports rollups for one date (#1812, #1813; data from #2012) — ONE query
 * for `/regions/growth` and every `/region/:n/growth`; they share this key,
 * so moving between them is free.
 *
 * The page passes its own resolved snapshot date (R3, Lesson 59); without
 * one the hook resolves latest itself. An absent artifact is `reports:
 * null` — "not available yet" — not an error.
 */
import { useQuery } from '@tanstack/react-query'
import type { ReportsRollups } from '@taverns-red/shared-contracts'
import {
  fetchCdnReportsRollups,
  fetchLatestSnapshotDate,
} from '../services/cdn'
import type { SnapshotDate } from '../types/snapshotDate'

export function reportsRollupsQueryKey(
  date: SnapshotDate | undefined
): readonly ['reports-rollups', string] {
  return ['reports-rollups', date ?? 'latest'] as const
}

export interface UseReportsRollupsResult {
  reports: ReportsRollups | null
  isLoading: boolean
}

export function useReportsRollups(
  date: SnapshotDate | undefined
): UseReportsRollupsResult {
  const query = useQuery<ReportsRollups | null>({
    queryKey: reportsRollupsQueryKey(date),
    queryFn: async () =>
      fetchCdnReportsRollups(date ?? (await fetchLatestSnapshotDate())),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
  return { reports: query.data ?? null, isLoading: query.isLoading }
}
