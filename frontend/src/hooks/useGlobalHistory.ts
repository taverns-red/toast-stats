/**
 * Worldwide-rollup hooks for the `/history` scoreboard (#1500, epic #1496).
 *
 * `useGlobalHistory` is ONE fetch for the whole scoreboard: Sprint 3 (#1499)
 * publishes `v1/global-history.json` with one pre-assembled row per completed
 * program year, so the page derives nothing from response data.
 *
 * `useGlobalClubsByCountry` reads clubs-by-country from the LATEST snapshot's
 * `global-totals.json` (#1498). It takes an optional `date` so a caller that
 * has already resolved a snapshot date can pin this query to the same one
 * (Lesson 59) instead of letting a second query resolve "latest" on its own
 * and straddle a publish. `/history` has no other latest-date query today;
 * any future one on this page must thread its resolved date through here.
 */

import { useQuery } from '@tanstack/react-query'
import type {
  GlobalHistory,
  GlobalTotals,
  GlobalTotalsClubsByCountry,
} from '@taverns-red/shared-contracts'
import {
  fetchCdnGlobalHistory,
  fetchCdnGlobalTotals,
  fetchLatestSnapshotDate,
} from '../services/cdn'
import type { SnapshotDate } from '../types/snapshotDate'

export const globalHistoryQueryKey = ['global-history'] as const

export interface UseGlobalHistoryResult {
  /** The published series, or null when the artifact is not on the CDN yet. */
  history: GlobalHistory | null
  isLoading: boolean
  isError: boolean
}

export function useGlobalHistory(): UseGlobalHistoryResult {
  const query = useQuery<GlobalHistory | null>({
    queryKey: globalHistoryQueryKey,
    queryFn: fetchCdnGlobalHistory,
    // Completed program years are immutable; the artifact only gains rows.
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: failureCount => failureCount < 2,
  })

  return {
    history: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export interface UseGlobalClubsByCountryResult {
  clubsByCountry: GlobalTotalsClubsByCountry | null
  /** The whole every country share is a share of. */
  clubsCounted: number | null
  /** The snapshot date the table is pinned to. */
  snapshotDate: string | null
  isLoading: boolean
  isError: boolean
}

export function useGlobalClubsByCountry(
  date?: SnapshotDate
): UseGlobalClubsByCountryResult {
  const query = useQuery<{ totals: GlobalTotals | null; date: string }>({
    queryKey: ['global-totals-countries', date ?? 'latest'],
    queryFn: async () => {
      const resolved = date ?? (await fetchLatestSnapshotDate())
      return { totals: await fetchCdnGlobalTotals(resolved), date: resolved }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  return {
    clubsByCountry: query.data?.totals?.clubsByCountry ?? null,
    clubsCounted: query.data?.totals?.membership.clubsCounted ?? null,
    snapshotDate: query.data?.date ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
